import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GpuLbmSolver, getLbmComputeCapability } from "./gpuSolver";

interface MockSpyTotals {
  buffers: number;
  pipelines: number;
  shaderModules: number;
  bindGroups: number;
  dispatches: number;
  submits: number;
}

/**
 * Build a richer WebGPU mock that exposes enough surface for GpuLbmSolver to
 * take the GPU code path. Only counts traffic — we don't simulate physics.
 * uvStaging.mapAsync resolves with a zero-filled view so the readback path
 * completes without throwing.
 */
function buildRichGpuMock(N: number): {
  navigator: { gpu: { requestAdapter(): Promise<unknown> } };
  totals: MockSpyTotals;
} {
  const totals: MockSpyTotals = {
    buffers: 0,
    pipelines: 0,
    shaderModules: 0,
    bindGroups: 0,
    dispatches: 0,
    submits: 0,
  };

  const makeBuffer = (size: number) => {
    totals.buffers += 1;
    const backing = new ArrayBuffer(size);
    return {
      destroy() {},
      async mapAsync() {},
      getMappedRange() {
        return backing;
      },
      unmap() {},
    };
  };

  const makePipeline = () => {
    totals.pipelines += 1;
    return {
      getBindGroupLayout() {
        return { __layout: true };
      },
    };
  };

  const pass = {
    setPipeline() {},
    setBindGroup() {},
    dispatchWorkgroups() {
      totals.dispatches += 1;
    },
    end() {},
  };
  const encoder = {
    beginComputePass() {
      return pass;
    },
    copyBufferToBuffer() {},
    finish() {
      return { __cmd: true };
    },
  };

  const device = {
    destroy() {},
    createShaderModule() {
      totals.shaderModules += 1;
      return { __mod: true };
    },
    createBuffer({ size }: { size: number }) {
      return makeBuffer(size);
    },
    createBindGroup() {
      totals.bindGroups += 1;
      return { __bg: true };
    },
    createComputePipeline() {
      return makePipeline();
    },
    createCommandEncoder() {
      return encoder;
    },
    queue: {
      writeBuffer() {},
      submit() {
        totals.submits += 1;
      },
    },
  };

  const navigator = {
    gpu: {
      async requestAdapter() {
        return {
          async requestDevice() {
            return device;
          },
        };
      },
    },
  };
  // N is a soft hint for the readback buffer size; the real solver decides.
  void N;
  return { navigator, totals };
}

describe("GpuLbmSolver adapter", () => {
  it("reports an implemented live adapter with prebaked fallback available", () => {
    const capability = getLbmComputeCapability();

    assert.equal(capability.webGpuImplemented, true);
    assert.equal(capability.prebakedFallbackAvailable, true);
    assert.doesNotMatch(capability.reason, /not implemented|scaffold/i);
    assert.doesNotMatch(capability.reason, /CPU reference/i);
  });

  it("initializes against a browser WebGPU adapter and returns a live field", async () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        gpu: {
          async requestAdapter() {
            return {
              async requestDevice() {
                return { destroy() {} };
              },
            };
          },
        },
      },
    });

    try {
      const solver = new GpuLbmSolver({
        templateId: "tampines-greenweave",
        compassDeg: 45,
        ambientWindMps: 1.9,
        iterations: 4,
      });
      await solver.init();
      solver.step();
      const field = await solver.readVelocityField();

      assert.equal(field.width, 256);
      assert.equal(field.height, 256);
      assert.equal(field.data.length, 256 * 256 * 2);
      solver.destroy();
    } finally {
      if (previous) {
        Object.defineProperty(globalThis, "navigator", previous);
      } else {
        delete (globalThis as { navigator?: Navigator }).navigator;
      }
    }
  });

  it("dispatches GPU compute passes when the device exposes the full WebGPU surface", async () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    const { navigator, totals } = buildRichGpuMock(256);
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: navigator });

    try {
      const solver = new GpuLbmSolver({
        templateId: "tampines-greenweave",
        compassDeg: 90,
        ambientWindMps: 2.1,
        iterations: 3,
      });
      await solver.init();

      // init() should have built buffers, pipelines, shader modules, bind groups.
      assert.equal(totals.shaderModules, 5, "expected five WGSL modules");
      assert.equal(totals.pipelines, 5, "expected five compute pipelines");
      assert.ok(totals.buffers >= 10, `expected >=10 GPU buffers, got ${totals.buffers}`);
      assert.ok(totals.bindGroups >= 10, `expected >=10 bind groups, got ${totals.bindGroups}`);

      const field = await solver.readVelocityField();

      // Each step encodes 4 dispatches (collide, stream, inlet, outlet); the
      // final readback adds one reduce dispatch. With iterations=3 and no
      // explicit step() calls, expect 3*4 + 1 = 13 dispatches and 2 submits
      // (one batched submit per encoded step + one for reduce). The submit
      // count is implementation-defined; only dispatch count is asserted.
      assert.equal(totals.dispatches, 13, "expected 13 compute dispatches total");

      // Canonical D2Q9 grid is 256x256 per brief.
      assert.equal(field.width, 256);
      assert.equal(field.height, 256);
      assert.equal(field.data.length, 256 * 256 * 2);
      solver.destroy();
    } finally {
      if (previous) {
        Object.defineProperty(globalThis, "navigator", previous);
      } else {
        delete (globalThis as { navigator?: Navigator }).navigator;
      }
    }
  });
});
