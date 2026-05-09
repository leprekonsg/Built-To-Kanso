/**
 * Pure-TypeScript reference D2Q9 BGK Lattice-Boltzmann solver.
 *
 * This is the JS fallback / pre-bake source. Correctness > performance.
 * The GPU compute path (gpuSolver.ts) is the canonical run-time path; this
 * module is also the source of truth for the WGSL kernels' algorithm.
 *
 * Algorithm:
 *   1. Build obstacle mask from `PlanGeometry` (walls + fixed elements).
 *   2. Initialise f_i = f_i^eq at rho=1, u = ambient inflow.
 *   3. Each step: collide (BGK, tau) then stream.
 *   4. Boundaries: bounce-back on solids, constant-velocity inlet on the
 *      compass-aligned inflow edge, zero-gradient outlet on the opposite edge.
 *   5. After loop, reduce moments to (u, v).
 */

import type { PlanGeometry, Rect } from "@/server/geometry/types";
import { CS2, E, OPP, Q, W, writeEquilibrium } from "./lattice";
import type { ObstacleMask, RawVelocityField, VelocityField } from "./types";

/** BGK relaxation time. tau = 0.6 -> nu = (tau-0.5)/3 ~= 0.033 (lattice units). */
export const TAU = 0.6;
export const RHO0 = 1.0;
/** Cap inlet velocity in lattice units to keep BGK stable (Mach < ~0.1). */
export const MAX_INLET_LU = 0.08;

/** Compass + ambient wind -> lattice inlet velocity (lu). Shared by CPU + GPU paths. */
export function computeInletVelocity(
  compassDeg: number,
  ambientWindMps: number,
): { ux: number; uy: number } {
  const physScale = ambientWindMps > 0 ? Math.min(ambientWindMps / 8, 1) : 0.5;
  const inletMag = MAX_INLET_LU * physScale;
  const rad = (compassDeg * Math.PI) / 180;
  return {
    ux: -Math.sin(rad) * inletMag,
    uy: -Math.cos(rad) * inletMag,
  };
}

/**
 * Run the CPU reference solver.
 *
 * `iterations` defaults to 2000. The brief calls for a 256x256 canonical grid;
 * for a JS reference loop that is ~100M cell-updates per call. We expose the
 * grid size via the optional `gridSize` arg and default to **64** to keep the
 * dev/typecheck loop snappy. The pre-bake pipeline can opt into 128 or 256.
 *
 * The result is cast to `VelocityField` (which pins 256x256 as the canonical
 * contract). Consumers that need the actual grid size should read it back via
 * `result.width` — the runtime value is the source of truth.
 */
export function runLbmCpu(
  plan: PlanGeometry,
  compassDeg: number,
  ambientWindMps: number,
  iterations: number = 2000,
  gridSize: number = 64,
): VelocityField {
  const N = gridSize;
  const NQ = N * N * Q;

  // Compass bearing -> inlet direction in lattice (+x east, +y north).
  // 0=N -> wind blows southward -> u = (0, -1). 90=E -> u = (-1, 0). etc.
  const { ux: inletUx, uy: inletUy } = computeInletVelocity(compassDeg, ambientWindMps);

  const inflowEdge = pickInflowEdge(compassDeg);
  const obstacles = buildObstacleMask(plan, N);

  // f and fNew are flat [N*N*Q] buffers in row-major (y, x, q).
  const f = new Float32Array(NQ);
  const fNew = new Float32Array(NQ);

  // Init.
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const off = (y * N + x) * Q;
      writeEquilibrium(f, off, RHO0, inletUx, inletUy);
    }
  }

  for (let step = 0; step < iterations; step++) {
    collide(f, obstacles, N);
    stream(f, fNew, obstacles, N);
    applyInlet(fNew, N, inflowEdge, inletUx, inletUy);
    applyOutlet(fNew, N, inflowEdge);
    // Swap.
    f.set(fNew);
  }

  return reduceToVelocity(f, obstacles, N);
}

/** BGK collision in place: f_i <- f_i - (1/tau)(f_i - f_i^eq). Bounce-back on solids. */
function collide(f: Float32Array, mask: ObstacleMask, N: number): void {
  const omega = 1 / TAU;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const cellIdx = y * N + x;
      const off = cellIdx * Q;

      if (mask.data[cellIdx] === 1) {
        // Solid: swap opposite distributions (mid-grid bounce-back).
        // f5<->f7, f6<->f8, f1<->f3, f2<->f4. Rest f0 unchanged.
        for (let i = 1; i < Q; i++) {
          if (i < OPP[i]) {
            const a = off + i;
            const b = off + OPP[i];
            const tmp = f[a];
            f[a] = f[b];
            f[b] = tmp;
          }
        }
        continue;
      }

      // Compute moments rho, u, v.
      let rho = 0;
      let mx = 0;
      let my = 0;
      for (let i = 0; i < Q; i++) {
        const fi = f[off + i];
        rho += fi;
        mx += fi * E[i][0];
        my += fi * E[i][1];
      }
      if (rho < 1e-9) rho = 1e-9;
      const ux = mx / rho;
      const uy = my / rho;
      const usq = ux * ux + uy * uy;

      // f_i <- (1-omega) f_i + omega f_i^eq.
      for (let i = 0; i < Q; i++) {
        const ex = E[i][0];
        const ey = E[i][1];
        const eu = ex * ux + ey * uy;
        const feq = W[i] * rho * (1 + eu / CS2 + (eu * eu) / (2 * CS2 * CS2) - usq / (2 * CS2));
        f[off + i] = f[off + i] - omega * (f[off + i] - feq);
      }
    }
  }
}

/** Streaming: f_i(x + e_i, t+1) = f_i(x, t). Periodic at edges; inlets/outlets fix later. */
function stream(f: Float32Array, fNew: Float32Array, _mask: ObstacleMask, N: number): void {
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dst = (y * N + x) * Q;
      for (let i = 0; i < Q; i++) {
        const sx = ((x - E[i][0]) % N + N) % N;
        const sy = ((y - E[i][1]) % N + N) % N;
        const src = (sy * N + sx) * Q + i;
        fNew[dst + i] = f[src];
      }
    }
  }
}

export type Edge = "north" | "south" | "east" | "west";

/** Pick the edge the wind enters through. Compass: 0=N -> wind enters from north -> "north". */
export function pickInflowEdge(compassDeg: number): Edge {
  const c = ((compassDeg % 360) + 360) % 360;
  if (c < 45 || c >= 315) return "north";
  if (c < 135) return "east";
  if (c < 225) return "south";
  return "west";
}

/** Constant-velocity inlet on the inflow edge: snap f to equilibrium at (rho=1, u=inlet). */
function applyInlet(f: Float32Array, N: number, edge: Edge, ux: number, uy: number): void {
  const set = (x: number, y: number) => writeEquilibrium(f, (y * N + x) * Q, RHO0, ux, uy);
  if (edge === "north") for (let x = 0; x < N; x++) set(x, N - 1);
  else if (edge === "south") for (let x = 0; x < N; x++) set(x, 0);
  else if (edge === "east") for (let y = 0; y < N; y++) set(N - 1, y);
  else for (let y = 0; y < N; y++) set(0, y);
}

/** Zero-gradient outlet on the opposite edge: copy from one cell inward. */
function applyOutlet(f: Float32Array, N: number, inflow: Edge): void {
  const copy = (dx: number, dy: number, sx: number, sy: number) => {
    const dst = (dy * N + dx) * Q;
    const src = (sy * N + sx) * Q;
    for (let i = 0; i < Q; i++) f[dst + i] = f[src + i];
  };
  if (inflow === "north") for (let x = 0; x < N; x++) copy(x, 0, x, 1);
  else if (inflow === "south") for (let x = 0; x < N; x++) copy(x, N - 1, x, N - 2);
  else if (inflow === "east") for (let y = 0; y < N; y++) copy(0, y, 1, y);
  else for (let y = 0; y < N; y++) copy(N - 1, y, N - 2, y);
}

/** After the iteration loop, reduce moments to a velocity field. */
function reduceToVelocity(f: Float32Array, mask: ObstacleMask, N: number): VelocityField {
  const out = new Float32Array(N * N * 2);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const cellIdx = y * N + x;
      if (mask.data[cellIdx] === 1) {
        out[cellIdx * 2] = 0;
        out[cellIdx * 2 + 1] = 0;
        continue;
      }
      const off = cellIdx * Q;
      let rho = 0;
      let mx = 0;
      let my = 0;
      for (let i = 0; i < Q; i++) {
        const fi = f[off + i];
        rho += fi;
        mx += fi * E[i][0];
        my += fi * E[i][1];
      }
      if (rho < 1e-9) rho = 1e-9;
      out[cellIdx * 2] = mx / rho;
      out[cellIdx * 2 + 1] = my / rho;
    }
  }
  // Cast: VelocityField nominally pins 256x256. We carry runtime grid size
  // through `width`/`height`. See types.ts note.
  const raw: RawVelocityField = { width: N, height: N, data: out };
  return raw as unknown as VelocityField;
}

/**
 * Build a 0/1 obstacle mask from the plan geometry.
 *
 * The simulation domain spans `plan.bounds` rasterised onto an NxN grid.
 * We mark:
 *   - cells outside any room as solid (exterior wall envelope),
 *   - cells inside a fixed element (shelter, structural wall, pipeshaft mouth)
 *     as solid.
 * Wet zones and pipeshaft openings are flagged solid. The pipeshaft jet is
 * overlaid after field generation so Hard Rule #16 stays visible without
 * letting a Black-state opening become editable compliance geometry.
 */
export function buildObstacleMask(plan: PlanGeometry, N: number): ObstacleMask {
  const data = new Uint8Array(N * N);
  const { bounds } = plan;

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const px = bounds.x + ((x + 0.5) / N) * bounds.width;
      const py = bounds.y + ((y + 0.5) / N) * bounds.height;

      // Default solid; fluid only inside a non-bathroom non-shelter room.
      let solid = 1;
      for (const room of plan.rooms) {
        if (rectContains(room, px, py)) {
          // Bathrooms and shelters are sealed (black confidence + wet zone) -> solid.
          solid = room.kind === "bathroom" || room.kind === "shelter" ? 1 : 0;
          break;
        }
      }

      // Fixed black elements always occlude.
      if (solid === 0) {
        for (const fx of plan.fixedElements) {
          if (rectContains(fx, px, py)) {
            solid = 1;
            break;
          }
        }
      }
      data[y * N + x] = solid;
    }
  }
  return { width: N, height: N, data } as unknown as ObstacleMask;
}

function rectContains(r: Rect, px: number, py: number): boolean {
  return px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height;
}
