/**
 * Browser-facing LBM compute adapter.
 *
 * Tier 1 of the brief's airflow stack: a real WebGPU D2Q9 BGK pipeline that
 * runs collide -> stream -> inlet -> outlet on the GPU and reads back a
 * VelocityField. The CPU reference (`runLbmCpu` in `solver.ts`) is the
 * algorithmic reference used by tests/prebakes; the demo fallback presented to
 * users is the Tier 4 prebaked local lookup.
 *
 * Uses the CPU reference only for unit-test mocks that expose `navigator.gpu`
 * without the full compute surface. In a real browser the `init()` call latches
 * `useGpu = true` and the rest of the lifecycle dispatches WGSL compute passes.
 */

import { equilibrium, Q } from "./lattice";
import {
  buildObstacleMask,
  computeInletVelocity,
  pickInflowEdge,
  RHO0,
  runLbmCpu,
  TAU,
  type Edge,
} from "./solver";
import type { LbmConfig, RawVelocityField, VelocityField } from "./types";
import { getPlanGeometry, isTemplateId } from "@/server/geometry/registry";
import type { PlanGeometry } from "@/server/geometry/types";

import {
  COLLIDE_WGSL,
  STREAM_WGSL,
  INLET_WGSL,
  OUTLET_WGSL,
  REDUCE_WGSL,
} from "./wgsl/kernels";

// ---------------------------------------------------------------------------
// Minimal local WebGPU typings. We deliberately avoid `@webgpu/types` so the
// dependency graph stays at zero new packages. Only the surface we actually
// call is typed; everything else is `unknown`.
// ---------------------------------------------------------------------------

interface NavigatorGPU {
  gpu?: { requestAdapter(): Promise<GpuAdapterMin | null> };
}

interface GpuAdapterMin {
  requestDevice(): Promise<GpuDeviceMin>;
}

interface GpuShaderModule {
  __brand?: "GpuShaderModule";
}
interface GpuBuffer {
  destroy?(): void;
  mapAsync(mode: number): Promise<void>;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
}
interface GpuBindGroupLayout {
  __brand?: "GpuBindGroupLayout";
}
interface GpuBindGroup {
  __brand?: "GpuBindGroup";
}
interface GpuComputePipeline {
  getBindGroupLayout(index: number): GpuBindGroupLayout;
}
interface GpuComputePassEncoder {
  setPipeline(p: GpuComputePipeline): void;
  setBindGroup(index: number, group: GpuBindGroup): void;
  dispatchWorkgroups(x: number, y?: number, z?: number): void;
  end(): void;
}
interface GpuCommandEncoder {
  beginComputePass(): GpuComputePassEncoder;
  copyBufferToBuffer(src: GpuBuffer, srcOffset: number, dst: GpuBuffer, dstOffset: number, size: number): void;
  finish(): unknown;
}
interface GpuQueue {
  writeBuffer(buffer: GpuBuffer, offset: number, data: ArrayBufferView): void;
  submit(commands: unknown[]): void;
}
interface GpuDeviceMin {
  destroy(): void;
  // The fields below are only present on real WebGPU devices. The unit-test
  // mock omits them; the constructor uses their absence as the fallback signal.
  createShaderModule?: (desc: { code: string }) => GpuShaderModule;
  createBuffer?: (desc: { size: number; usage: number; mappedAtCreation?: boolean }) => GpuBuffer;
  createBindGroup?: (desc: {
    layout: GpuBindGroupLayout;
    entries: Array<{ binding: number; resource: { buffer: GpuBuffer } }>;
  }) => GpuBindGroup;
  createComputePipeline?: (desc: {
    layout: "auto";
    compute: { module: GpuShaderModule; entryPoint: string };
  }) => GpuComputePipeline;
  createCommandEncoder?: () => GpuCommandEncoder;
  queue?: GpuQueue;
}

// GPUBufferUsage flag values (from the WebGPU spec). Hard-coded so we don't
// rely on a global at import time.
const GPU_BUFFER_USAGE = {
  MAP_READ: 0x0001,
  COPY_DST: 0x0008,
  COPY_SRC: 0x0004,
  STORAGE: 0x0080,
  UNIFORM: 0x0040,
};
const GPU_MAP_MODE_READ = 0x0001;

// ---------------------------------------------------------------------------
// Capability reporting
// ---------------------------------------------------------------------------

export interface LbmComputeCapability {
  webGpuAvailable: boolean;
  webGpuImplemented: boolean;
  prebakedFallbackAvailable: true;
  reason: string;
}

export function getLbmComputeCapability(): LbmComputeCapability {
  const nav = (typeof navigator !== "undefined" ? navigator : undefined) as
    | (Navigator & NavigatorGPU)
    | undefined;

  return {
    webGpuAvailable: Boolean(nav?.gpu),
    webGpuImplemented: true,
    prebakedFallbackAvailable: true,
    reason: nav?.gpu
      ? "WebGPU adapter is available; live LBM adapter dispatches D2Q9 collide/stream/inlet/outlet kernels in the browser."
      : "WebGPU adapter is unavailable in this runtime; the demo uses the Tier 4 prebaked local lookup.",
  };
}

// ---------------------------------------------------------------------------
// Solver
// ---------------------------------------------------------------------------

/**
 * Canonical D2Q9 grid per brief Section 11 / 16:
 * "WGSL D2Q9 LBM, kishimisu-style stable-fluids architecture, 256x256 grid,
 *  60fps, runs locally. Memory budget: ~18 MB."
 *
 * Memory: 2 ping-pong f buffers (256*256*9*4 bytes) + mask + uv + uvStaging
 * = 2*2.36 MB + 0.26 MB + 2*0.52 MB = ~6.6 MB. Well within budget.
 *
 * The pure-CPU reference (`solver.ts`) defaults to a 64-cell grid for
 * pre-bake / dev-loop performance; the GPU path always runs at the
 * canonical 256.
 */
const GRID = 256;
const WG = 8;
const QUNI = Q;

interface GpuRuntime {
  device: GpuDeviceMin;
  // ping-pong distribution buffers (Float32Array of length N*N*Q)
  fA: GpuBuffer;
  fB: GpuBuffer;
  // 1 = solid, 0 = fluid (Uint32 of length N*N)
  mask: GpuBuffer;
  // velocity output (vec2<f32> of length N*N — Float32 of length N*N*2)
  uv: GpuBuffer;
  // staging readback buffer for uv (mapped on read)
  uvStaging: GpuBuffer;
  // uniform buffers
  collideUniform: GpuBuffer; // 16 bytes
  streamUniform: GpuBuffer;  // 16 bytes
  reduceUniform: GpuBuffer;  // 16 bytes
  inletUniform: GpuBuffer;   // 16 bytes
  outletUniform: GpuBuffer;  // 16 bytes

  collidePipeline: GpuComputePipeline;
  streamPipeline: GpuComputePipeline;
  inletPipeline: GpuComputePipeline;
  outletPipeline: GpuComputePipeline;
  reducePipeline: GpuComputePipeline;

  // Bind groups for ping-pong: index 0 corresponds to "current = fA",
  // index 1 corresponds to "current = fB".
  collideBindGroups: [GpuBindGroup, GpuBindGroup];
  // Stream: 0 = read fA write fB, 1 = read fB write fA.
  streamBindGroups: [GpuBindGroup, GpuBindGroup];
  // Inlet/outlet operate on the post-stream "destination" buffer.
  inletBindGroups: [GpuBindGroup, GpuBindGroup];
  outletBindGroups: [GpuBindGroup, GpuBindGroup];
  // Reduce reads from current.
  reduceBindGroups: [GpuBindGroup, GpuBindGroup];

  // Initial f buffer in JS for re-uploads (CPU equilibrium init).
  initialF: Float32Array;
  // Which buffer currently holds the latest f.
  currentIsA: boolean;
  // Total iterations applied so far (init iters + extra step calls).
  appliedIterations: number;
  inflowEdgeCode: number;
  inletUx: number;
  inletUy: number;
}

export class GpuLbmSolver {
  private device: GpuDeviceMin | null = null;
  private config: LbmConfig;
  private cachedField: VelocityField | null = null;
  private initialized = false;
  private steppedIterations = 0;
  private useGpu = false;
  private runtime: GpuRuntime | null = null;
  private plan: PlanGeometry | null = null;

  constructor(config: LbmConfig) {
    this.config = config;
  }

  /**
   * Acquire a GPU device. Throws if WebGPU is unavailable. Callers must record
   * the fallback source explicitly in server metadata.
   */
  async init(): Promise<void> {
    const nav = (typeof navigator !== "undefined" ? navigator : undefined) as
      | (Navigator & NavigatorGPU)
      | undefined;
    if (!nav?.gpu) {
      throw new Error("WebGPU unavailable.");
    }
    if (!isTemplateId(this.config.templateId)) {
      throw new Error(`unknown templateId "${this.config.templateId}"`);
    }
    const adapter = await nav.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("No WebGPU adapter.");
    }
    this.device = await adapter.requestDevice();
    this.plan = getPlanGeometry(this.config.templateId);
    this.initialized = true;
    this.cachedField = null;
    this.steppedIterations = 0;

    // Real WebGPU device or test stub? Feature-detect once.
    const dev = this.device;
    this.useGpu = Boolean(
      dev.createBuffer && dev.createComputePipeline && dev.createShaderModule && dev.queue,
    );
    if (this.useGpu) {
      this.runtime = this.buildRuntime(dev, this.plan);
    }
  }

  step(): void {
    if (!this.initialized) {
      throw new Error("Call init() before stepping the LBM solver.");
    }
    this.cachedField = null;
    this.steppedIterations += 1;
    if (this.useGpu && this.runtime) {
      this.dispatchOneStep(this.runtime);
    }
  }

  /**
   * Read back the velocity field. On a real WebGPU device we run any
   * outstanding iterations on the GPU and read the velocity buffer. Unit-test
   * mocks without the full compute surface use the CPU reference so adapter
   * tests stay deterministic; product callers still fall through to Tier 4
   * when `runTier1IfAvailable` cannot acquire a real browser WebGPU path.
   */
  async readVelocityField(): Promise<VelocityField> {
    if (this.cachedField) return this.cachedField;
    if (!isTemplateId(this.config.templateId)) {
      throw new Error(`unknown templateId "${this.config.templateId}"`);
    }
    const plan = this.plan ?? getPlanGeometry(this.config.templateId);
    const totalIterations = Math.max(1, this.config.iterations + this.steppedIterations);

    if (this.useGpu && this.runtime) {
      const field = await this.runGpuToCompletion(this.runtime, totalIterations);
      this.cachedField = field;
      return field;
    }

    const field = runLbmCpu(
      plan,
      this.config.compassDeg,
      this.config.ambientWindMps,
      totalIterations,
      GRID,
    );
    this.cachedField = field;
    return field;
  }

  destroy(): void {
    if (this.runtime) {
      tryDestroy(this.runtime.fA);
      tryDestroy(this.runtime.fB);
      tryDestroy(this.runtime.mask);
      tryDestroy(this.runtime.uv);
      tryDestroy(this.runtime.uvStaging);
      tryDestroy(this.runtime.collideUniform);
      tryDestroy(this.runtime.streamUniform);
      tryDestroy(this.runtime.reduceUniform);
      tryDestroy(this.runtime.inletUniform);
      tryDestroy(this.runtime.outletUniform);
      this.runtime = null;
    }
    this.device?.destroy();
    this.device = null;
    this.initialized = false;
    this.useGpu = false;
    this.steppedIterations = 0;
    this.cachedField = null;
    this.plan = null;
  }

  // -------------------------------------------------------------------------
  // GPU pipeline construction
  // -------------------------------------------------------------------------

  private buildRuntime(dev: GpuDeviceMin, plan: PlanGeometry): GpuRuntime {
    if (
      !dev.createShaderModule ||
      !dev.createBuffer ||
      !dev.createComputePipeline ||
      !dev.createBindGroup ||
      !dev.queue
    ) {
      throw new Error("buildRuntime invoked on a device without WebGPU compute methods.");
    }

    const N = GRID;
    const NQ = N * N * QUNI;

    // Inlet velocity + edge.
    const inflowEdge = pickInflowEdge(this.config.compassDeg);
    const edgeCode = edgeToCode(inflowEdge);
    const { ux: inletUx, uy: inletUy } = computeInletVelocity(
      this.config.compassDeg,
      this.config.ambientWindMps,
    );

    // Buffers ----------------------------------------------------------------
    const fByteSize = NQ * 4;
    const maskByteSize = N * N * 4; // u32 per cell
    const uvByteSize = N * N * 2 * 4; // vec2<f32>

    const fA = dev.createBuffer({
      size: fByteSize,
      usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST | GPU_BUFFER_USAGE.COPY_SRC,
    });
    const fB = dev.createBuffer({
      size: fByteSize,
      usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST | GPU_BUFFER_USAGE.COPY_SRC,
    });
    const mask = dev.createBuffer({
      size: maskByteSize,
      usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST,
    });
    const uv = dev.createBuffer({
      size: uvByteSize,
      usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_SRC,
    });
    const uvStaging = dev.createBuffer({
      size: uvByteSize,
      usage: GPU_BUFFER_USAGE.MAP_READ | GPU_BUFFER_USAGE.COPY_DST,
    });

    const collideUniform = dev.createBuffer({
      size: 16,
      usage: GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST,
    });
    const streamUniform = dev.createBuffer({
      size: 16,
      usage: GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST,
    });
    const reduceUniform = dev.createBuffer({
      size: 16,
      usage: GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST,
    });
    const inletUniform = dev.createBuffer({
      size: 16,
      usage: GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST,
    });
    const outletUniform = dev.createBuffer({
      size: 16,
      usage: GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST,
    });

    // Initial f from CPU equilibrium (so the field starts at the inlet flow,
    // matching solver.ts). buildObstacleMask is reused for parity.
    const initialF = buildInitialF(N, inletUx, inletUy);
    const maskU8 = buildObstacleMask(plan, N).data;
    const maskU32 = new Uint32Array(maskU8.length);
    for (let i = 0; i < maskU8.length; i++) maskU32[i] = maskU8[i];

    dev.queue.writeBuffer(fA, 0, initialF);
    dev.queue.writeBuffer(fB, 0, initialF);
    dev.queue.writeBuffer(mask, 0, maskU32);

    // Uniforms ---------------------------------------------------------------
    // collide / stream / reduce all share the same {size:u32, tau:f32, _pad:vec2<f32>} layout.
    const sharedUni = new ArrayBuffer(16);
    const sharedView = new DataView(sharedUni);
    sharedView.setUint32(0, N, true);
    sharedView.setFloat32(4, TAU, true);
    sharedView.setFloat32(8, 0, true);
    sharedView.setFloat32(12, 0, true);
    dev.queue.writeBuffer(collideUniform, 0, new Uint8Array(sharedUni));
    dev.queue.writeBuffer(streamUniform, 0, new Uint8Array(sharedUni));
    dev.queue.writeBuffer(reduceUniform, 0, new Uint8Array(sharedUni));

    // inlet/outlet share {size:u32, inflowEdge:u32, inletUx:f32, inletUy:f32}.
    const ioUni = new ArrayBuffer(16);
    const ioView = new DataView(ioUni);
    ioView.setUint32(0, N, true);
    ioView.setUint32(4, edgeCode, true);
    ioView.setFloat32(8, inletUx, true);
    ioView.setFloat32(12, inletUy, true);
    dev.queue.writeBuffer(inletUniform, 0, new Uint8Array(ioUni));
    dev.queue.writeBuffer(outletUniform, 0, new Uint8Array(ioUni));

    // Pipelines --------------------------------------------------------------
    const collideModule = dev.createShaderModule({ code: COLLIDE_WGSL });
    const streamModule = dev.createShaderModule({ code: STREAM_WGSL });
    const inletModule = dev.createShaderModule({ code: INLET_WGSL });
    const outletModule = dev.createShaderModule({ code: OUTLET_WGSL });
    const reduceModule = dev.createShaderModule({ code: REDUCE_WGSL });

    const collidePipeline = dev.createComputePipeline({
      layout: "auto",
      compute: { module: collideModule, entryPoint: "main" },
    });
    const streamPipeline = dev.createComputePipeline({
      layout: "auto",
      compute: { module: streamModule, entryPoint: "main" },
    });
    const inletPipeline = dev.createComputePipeline({
      layout: "auto",
      compute: { module: inletModule, entryPoint: "main" },
    });
    const outletPipeline = dev.createComputePipeline({
      layout: "auto",
      compute: { module: outletModule, entryPoint: "main" },
    });
    const reducePipeline = dev.createComputePipeline({
      layout: "auto",
      compute: { module: reduceModule, entryPoint: "main" },
    });

    // Bind groups (per ping-pong state) -------------------------------------
    const collideBgA = dev.createBindGroup({
      layout: collidePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: fA } },
        { binding: 1, resource: { buffer: mask } },
        { binding: 2, resource: { buffer: collideUniform } },
      ],
    });
    const collideBgB = dev.createBindGroup({
      layout: collidePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: fB } },
        { binding: 1, resource: { buffer: mask } },
        { binding: 2, resource: { buffer: collideUniform } },
      ],
    });

    // Stream: state 0 = src=A, dst=B; state 1 = src=B, dst=A.
    const streamBgAB = dev.createBindGroup({
      layout: streamPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: fA } },
        { binding: 1, resource: { buffer: fB } },
        { binding: 2, resource: { buffer: streamUniform } },
      ],
    });
    const streamBgBA = dev.createBindGroup({
      layout: streamPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: fB } },
        { binding: 1, resource: { buffer: fA } },
        { binding: 2, resource: { buffer: streamUniform } },
      ],
    });

    // Inlet/outlet: act on the post-stream destination buffer.
    const inletBgA = dev.createBindGroup({
      layout: inletPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: fA } },
        { binding: 1, resource: { buffer: inletUniform } },
      ],
    });
    const inletBgB = dev.createBindGroup({
      layout: inletPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: fB } },
        { binding: 1, resource: { buffer: inletUniform } },
      ],
    });
    const outletBgA = dev.createBindGroup({
      layout: outletPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: fA } },
        { binding: 1, resource: { buffer: outletUniform } },
      ],
    });
    const outletBgB = dev.createBindGroup({
      layout: outletPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: fB } },
        { binding: 1, resource: { buffer: outletUniform } },
      ],
    });

    // Reduce reads "current" f and writes uv.
    const reduceBgA = dev.createBindGroup({
      layout: reducePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: fA } },
        { binding: 1, resource: { buffer: mask } },
        { binding: 2, resource: { buffer: uv } },
        { binding: 3, resource: { buffer: reduceUniform } },
      ],
    });
    const reduceBgB = dev.createBindGroup({
      layout: reducePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: fB } },
        { binding: 1, resource: { buffer: mask } },
        { binding: 2, resource: { buffer: uv } },
        { binding: 3, resource: { buffer: reduceUniform } },
      ],
    });

    return {
      device: dev,
      fA,
      fB,
      mask,
      uv,
      uvStaging,
      collideUniform,
      streamUniform,
      reduceUniform,
      inletUniform,
      outletUniform,
      collidePipeline,
      streamPipeline,
      inletPipeline,
      outletPipeline,
      reducePipeline,
      collideBindGroups: [collideBgA, collideBgB],
      streamBindGroups: [streamBgAB, streamBgBA],
      inletBindGroups: [inletBgA, inletBgB],
      outletBindGroups: [outletBgA, outletBgB],
      reduceBindGroups: [reduceBgA, reduceBgB],
      initialF,
      currentIsA: true,
      appliedIterations: 0,
      inflowEdgeCode: edgeCode,
      inletUx,
      inletUy,
    };
  }

  /**
   * Encode and submit a single LBM step on the GPU. Mirrors solver.ts:
   * collide(current) -> stream(current -> next) -> inlet(next) -> outlet(next).
   * The "next" buffer becomes "current" after submission.
   */
  private dispatchOneStep(rt: GpuRuntime): void {
    const dev = rt.device;
    if (!dev.createCommandEncoder || !dev.queue) return;

    const N = GRID;
    const groups = Math.ceil(N / WG);
    const edgeGroups = Math.ceil(N / 64);

    const encoder = dev.createCommandEncoder();
    const pass = encoder.beginComputePass();

    const curIdx = rt.currentIsA ? 0 : 1;
    const nextIsA = !rt.currentIsA;
    const nextIdx = nextIsA ? 0 : 1;
    // Stream bind group index: 0 = src=A,dst=B; 1 = src=B,dst=A.
    const streamIdx = rt.currentIsA ? 0 : 1;

    pass.setPipeline(rt.collidePipeline);
    pass.setBindGroup(0, rt.collideBindGroups[curIdx]);
    pass.dispatchWorkgroups(groups, groups, 1);

    pass.setPipeline(rt.streamPipeline);
    pass.setBindGroup(0, rt.streamBindGroups[streamIdx]);
    pass.dispatchWorkgroups(groups, groups, 1);

    pass.setPipeline(rt.inletPipeline);
    pass.setBindGroup(0, rt.inletBindGroups[nextIdx]);
    pass.dispatchWorkgroups(edgeGroups, 1, 1);

    pass.setPipeline(rt.outletPipeline);
    pass.setBindGroup(0, rt.outletBindGroups[nextIdx]);
    pass.dispatchWorkgroups(edgeGroups, 1, 1);

    pass.end();
    dev.queue.submit([encoder.finish()]);

    rt.currentIsA = nextIsA;
    rt.appliedIterations += 1;
  }

  /**
   * Run any iterations not yet applied, then reduce + read back the velocity.
   */
  private async runGpuToCompletion(
    rt: GpuRuntime,
    totalIterations: number,
  ): Promise<VelocityField> {
    while (rt.appliedIterations < totalIterations) {
      this.dispatchOneStep(rt);
    }

    const dev = rt.device;
    if (!dev.createCommandEncoder || !dev.queue) {
      throw new Error("readback requires command encoder + queue.");
    }
    const N = GRID;
    const groups = Math.ceil(N / WG);
    const reduceIdx = rt.currentIsA ? 0 : 1;

    const encoder = dev.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(rt.reducePipeline);
    pass.setBindGroup(0, rt.reduceBindGroups[reduceIdx]);
    pass.dispatchWorkgroups(groups, groups, 1);
    pass.end();
    encoder.copyBufferToBuffer(rt.uv, 0, rt.uvStaging, 0, N * N * 2 * 4);
    dev.queue.submit([encoder.finish()]);

    await rt.uvStaging.mapAsync(GPU_MAP_MODE_READ);
    const mapped = rt.uvStaging.getMappedRange();
    const out = new Float32Array(N * N * 2);
    out.set(new Float32Array(mapped.slice(0)));
    rt.uvStaging.unmap();

    const raw: RawVelocityField = { width: N, height: N, data: out };
    return raw as unknown as VelocityField;
  }
}

// ---------------------------------------------------------------------------
// Tier 1 dispatch + readback wrapper
// ---------------------------------------------------------------------------

/**
 * Best-effort Tier 1 dispatch: build the GPU pipeline, run `iterations`
 * steps, read back the velocity field. On any failure (WebGPU unavailable,
 * adapter rejection, dispatch error, readback timeout), returns `null` so the
 * caller can fall through to the explicitly surfaced Tier 4 prebaked lookup.
 *
 * Server-side this resolves to `null` (no `navigator.gpu` in Node). On the
 * client it produces a 256x256 velocity field ready for the streamlines
 * extractor.
 */
export async function runTier1IfAvailable(config: LbmConfig): Promise<VelocityField | null> {
  const nav = (typeof navigator !== "undefined" ? navigator : undefined) as
    | (Navigator & NavigatorGPU)
    | undefined;
  if (!nav?.gpu) return null;

  const solver = new GpuLbmSolver(config);
  try {
    await solver.init();
    const field = await solver.readVelocityField();
    return field;
  } catch {
    // Silent: Tier 4 will pick up the slack.
    return null;
  } finally {
    try {
      solver.destroy();
    } catch {
      // noop
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tryDestroy(buffer: GpuBuffer): void {
  try {
    buffer.destroy?.();
  } catch {
    /* noop — some implementations throw on already-destroyed buffers */
  }
}

function edgeToCode(edge: Edge): number {
  if (edge === "north") return 0;
  if (edge === "south") return 1;
  if (edge === "east") return 2;
  return 3; // west
}

function buildInitialF(N: number, ux: number, uy: number): Float32Array {
  const NQ = N * N * QUNI;
  const out = new Float32Array(NQ);
  const feq = equilibrium(RHO0, ux, uy);
  for (let cell = 0; cell < N * N; cell++) {
    const off = cell * QUNI;
    for (let i = 0; i < QUNI; i++) out[off + i] = feq[i];
  }
  return out;
}
