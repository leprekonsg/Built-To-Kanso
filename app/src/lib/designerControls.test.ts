import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  DEFAULT_DESIGNER_CONTROLS,
  DESIGNER_CONTROLS_STORAGE_KEY,
  clampPercent,
  normalizeDesignerControls,
  persistDesignerControls,
  readPersistedDesignerControls,
  type DesignerMaterialControls,
} from "./designerControls";

interface MockStorage {
  store: Map<string, string>;
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
}

function createMockStorage(): MockStorage {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  };
}

describe("designerControls", () => {
  let originalWindow: unknown;

  beforeEach(() => {
    originalWindow = (globalThis as Record<string, unknown>).window;
    (globalThis as Record<string, unknown>).window = { localStorage: createMockStorage() };
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      (globalThis as Record<string, unknown>).window = originalWindow;
    }
  });

  it("defaults preserve the legacy stream/dust baseline (Section 5.2 line 124)", () => {
    assert.equal(DEFAULT_DESIGNER_CONTROLS.density, 64, "density inherits streamStrength=64");
    assert.equal(DEFAULT_DESIGNER_CONTROLS.textureScale, 42, "textureScale inherits dustStrength=42");
    assert.equal(DEFAULT_DESIGNER_CONTROLS.preset, "monsoon_atelier_default");
    // All eight brief parameters are present.
    assert.deepEqual(
      Object.keys(DEFAULT_DESIGNER_CONTROLS).sort(),
      [
        "density",
        "preset",
        "softness",
        "stagnationOpacityThreshold",
        "textureScale",
        "turbulence",
        "velocityWidthMod",
        "visibility",
      ],
    );
  });

  it("clampPercent rounds, clamps, and rejects garbage", () => {
    assert.equal(clampPercent(50), 50);
    assert.equal(clampPercent(50.7), 51);
    assert.equal(clampPercent(-3), 0);
    assert.equal(clampPercent(143), 100);
    assert.equal(clampPercent("82"), 82);
    assert.equal(clampPercent("nope"), 0);
    assert.equal(clampPercent(NaN), 0);
    assert.equal(clampPercent(Infinity), 0);
  });

  it("normalizeDesignerControls rescues partial / corrupt input", () => {
    const partial = normalizeDesignerControls({ preset: "audit_lic", density: 200 });
    assert.equal(partial.preset, "audit_lic");
    assert.equal(partial.density, 100, "200 clamps to 100");
    assert.equal(partial.visibility, DEFAULT_DESIGNER_CONTROLS.visibility);

    const garbage = normalizeDesignerControls({ preset: "not-a-preset", visibility: "foo" });
    assert.equal(garbage.preset, DEFAULT_DESIGNER_CONTROLS.preset);
    assert.equal(garbage.visibility, 0);

    assert.deepEqual(normalizeDesignerControls(null), DEFAULT_DESIGNER_CONTROLS);
    assert.deepEqual(normalizeDesignerControls("oops"), DEFAULT_DESIGNER_CONTROLS);
  });

  it("persists and reads back the full control set", () => {
    const next: DesignerMaterialControls = {
      preset: "sumi_ink",
      visibility: 12,
      density: 88,
      turbulence: 33,
      softness: 44,
      velocityWidthMod: 55,
      stagnationOpacityThreshold: 66,
      textureScale: 77,
    };
    persistDesignerControls(next);
    assert.deepEqual(readPersistedDesignerControls(), next);
  });

  it("returns null when storage is empty (fresh session)", () => {
    assert.equal(readPersistedDesignerControls(), null);
  });

  it("recovers from corrupt JSON without throwing", () => {
    const storage = (globalThis as unknown as { window: { localStorage: MockStorage } }).window.localStorage;
    storage.store.set(DESIGNER_CONTROLS_STORAGE_KEY, "{not json");
    assert.equal(readPersistedDesignerControls(), null);
  });

  it("is SSR-safe (no window)", () => {
    delete (globalThis as Record<string, unknown>).window;
    assert.equal(readPersistedDesignerControls(), null);
    // Should not throw even without a window.
    persistDesignerControls(DEFAULT_DESIGNER_CONTROLS);
  });
});
