/**
 * WebGPU LBM compute solver — scaffold.
 *
 * SCOPE OF THIS FILE
 * ------------------
 * This is a scaffold. It defines the public surface that LiveStudio uses
 * (`init`, `step`, `readVelocityField`, `destroy`) and the kernel-bind plan
 * that pairs with `wgsl/collide.wgsl` and `wgsl/stream.wgsl`. Full kernel
 * dispatch + ping-pong is a known follow-up (see TODOs at the bottom).
 *
 * Until the GPU path is verified the JS reference (`solver.ts`) is the source
 * of truth, and callers must fall through to the Tier 4 prebake cache when
 * `init()` rejects.
 *
 * IMPORTANT: per CLAUDE.md the LBM solver does *not* depend on three.js. Three
 * is for visuals only. We use raw WebGPU here for compute. The renderer's
 * `await renderer.init()` requirement applies to the *display* surface in
 * LiveStudio, not to this compute pipeline.
 */

import { runLbmCpu } from "./solver";
import type { LbmConfig, VelocityField } from "./types";
import { getPlanGeometry, isTemplateId } from "@/server/geometry/registry";

// Minimal local WebGPU typings (we don't ship @webgpu/types). Just enough for
// this file to typecheck without `any`.
interface NavigatorGPU {
  gpu?: { requestAdapter(): Promise<GpuAdapterMin | null> };
}
interface GpuAdapterMin {
  requestDevice(): Promise<GpuDeviceMin>;
}
interface GpuDeviceMin {
  destroy(): void;
}

export class GpuLbmSolver {
  private device: GpuDeviceMin | null = null;
  private config: LbmConfig;
  private cachedField: VelocityField | null = null;

  constructor(config: LbmConfig) {
    this.config = config;
  }

  /**
   * Acquire a GPU device. Throws if WebGPU is unavailable so callers can
   * silently fall back to the prebake cache (per "Tier 4 fallback ... Never
   * surface the fallback to the user").
   */
  async init(): Promise<void> {
    const nav = (typeof navigator !== "undefined" ? navigator : undefined) as
      | (Navigator & NavigatorGPU)
      | undefined;
    if (!nav?.gpu) {
      throw new Error("WebGPU unavailable.");
    }
    const adapter = await nav.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("No WebGPU adapter.");
    }
    this.device = await adapter.requestDevice();
    // TODO: create storage buffers for f / fNew (size N*N*9 * 4 bytes),
    //   the obstacle mask, and the Params uniform. Compile WGSL via
    //   `device.createShaderModule({ code: collideWgsl })` etc.
  }

  /**
   * Advance the simulation by one step.
   * SCAFFOLD: currently a no-op placeholder; LiveStudio reads the final field
   * via `readVelocityField()`, which falls back to the CPU reference.
   */
  step(): void {
    // TODO: encode a command buffer that runs the collide pass then the stream
    // pass with bind groups swapped (ping-pong). Submit to the queue.
  }

  /**
   * Read back the velocity field. SCAFFOLD: runs the CPU reference once and
   * caches the result so repeated reads are cheap. The intent is for this to
   * map a staging buffer that holds the GPU-computed (u, v) once kernels land.
   */
  async readVelocityField(): Promise<VelocityField> {
    if (this.cachedField) return this.cachedField;
    if (!isTemplateId(this.config.templateId)) {
      throw new Error(`unknown templateId "${this.config.templateId}"`);
    }
    const plan = getPlanGeometry(this.config.templateId);
    // Reduced grid + iterations vs. canonical 256/2000 for scaffold parity
    // with `prebake.ts`. See TODO at end of file.
    const field = runLbmCpu(plan, this.config.compassDeg, this.config.ambientWindMps, 600, 64);
    this.cachedField = field;
    return field;
  }

  destroy(): void {
    this.device?.destroy();
    this.device = null;
    this.cachedField = null;
  }
}

// =============================================================================
// KNOWN FOLLOW-UPS (this is a scaffold)
// =============================================================================
// 1. Real GPU dispatch: bind buffers, compile collide.wgsl + stream.wgsl,
//    encode passes, ping-pong f/fNew. The JS reference in solver.ts is the
//    correctness oracle.
// 2. Inlet / outlet boundary kernels: separate compute passes that snap the
//    inflow edge to equilibrium and copy the outlet edge inward. solver.ts
//    `applyInlet` / `applyOutlet` are the reference implementations.
// 3. 256x256 canonical grid + 2000-iter loop on GPU. CPU path defaults to 64x64
//    / 600 iters because the JS loop does not scale.
// 4. Pipeshaft Dirichlet BC: inject jet velocity at `plan.pipeshaft.openingPoint`
//    rather than treating the opening as solid (see solver.ts buildObstacleMask
//    TODO). Tier 4 prebake currently models the jet via `tier4.ts` overlays.
// =============================================================================
