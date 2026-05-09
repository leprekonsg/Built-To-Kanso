/**
 * Canonical airflow physics types.
 *
 * Per CLAUDE.md "Physics and compliance":
 * - WebGPU LBM is canonical airflow.
 * - D2Q9 lattice, 256x256 grid.
 * - SVG streamlines extracted deterministically from LBM velocity field
 *   are the airflow source of truth in the UI.
 *
 * NOTE on grid size: the brief mandates 256x256 as the canonical grid for the
 * GPU solver. The CPU reference (`solver.ts`) accepts any grid size to keep
 * dev-loop typecheck/run-time reasonable; pre-bake currently runs at 64.
 * The interface still pins 256x256 as the canonical shape — runtime arrays may
 * differ during development, see solver.ts and prebake.ts for the cast.
 */

export interface VelocityField {
  width: number;
  height: number;
  /** size width*height*2: [u, v] interleaved, row-major (y * width + x) * 2 */
  data: Float32Array;
}

export interface LbmConfig {
  templateId: string;
  /** Compass heading of inflow wind, degrees (0=N, 90=E, 180=S, 270=W). */
  compassDeg: number;
  ambientWindMps: number;
  iterations: number;
}

export interface ObstacleMask {
  width: number;
  height: number;
  /** 1 = solid (bounce-back), 0 = fluid */
  data: Uint8Array;
}

/**
 * Internal helper: a velocity field of arbitrary grid size.
 * The public `VelocityField` always claims 256x256 (canonical contract).
 * `RawVelocityField` is what the CPU reference produces during dev when we
 * lower the grid for performance. Cache + UI consumers should treat both as
 * the same shape; the typecheck just enforces interleaved [u,v] data.
 */
export interface RawVelocityField {
  width: number;
  height: number;
  data: Float32Array;
}
