import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getPlanGeometry, listGeometrySummaries } from "@/server/geometry/registry";
import type { PlanGeometry } from "@/server/geometry/types";
import { buildTier4Simulation } from "@/server/simulation/tier4";
import type { Tier4SimulationField, VelocitySample } from "@/server/simulation/types";
import { buildSceneElementSpec, SHADOW_FRAME_COUNT } from "./sceneElements";

function makePlan(overrides?: Partial<PlanGeometry>): PlanGeometry {
  const base: PlanGeometry = {
    schemaVersion: 1,
    templateId: "tampines-greenweave",
    units: "meters",
    source: "architect_curated_template",
    bounds: { x: 0, y: 0, width: 10, height: 8 },
    openingAreaPct: 14,
    westSunFacadeDeg: 270,
    defaultDoorFacingDeg: 45,
    rooms: [
      { id: "living", label: "Living", kind: "living", confidence: "green", x: 5, y: 0, width: 5, height: 4 },
      { id: "bedroom", label: "Bedroom", kind: "bedroom", confidence: "green", x: 0, y: 0, width: 4, height: 3 },
      { id: "kitchen", label: "Kitchen", kind: "kitchen", confidence: "green", x: 0, y: 4, width: 4, height: 3 },
    ],
    openings: [
      {
        id: "living_window",
        kind: "window",
        roomIds: ["living"],
        start: { x: 5, y: 0 },
        end: { x: 9, y: 0 },
        operable: true,
      },
      {
        id: "bedroom_window",
        kind: "window",
        roomIds: ["bedroom"],
        start: { x: 0, y: 0.5 },
        end: { x: 0, y: 2.5 },
        operable: true,
      },
      {
        id: "main_door",
        kind: "door",
        roomIds: ["living"],
        start: { x: 9.2, y: 5 },
        end: { x: 9.8, y: 5 },
        operable: true,
      },
    ],
    fixedElements: [],
    pipeshaft: {
      id: "kitchen_pipeshaft",
      roomId: "kitchen",
      openingPoint: { x: 0.5, y: 4.3 },
      openingDirectionDeg: 0,
      jetVelocityMps: [0.15, 0.25],
      bufferRadiusM: 0.6,
      downwindRoomIds: ["bedroom"],
    },
    bathrooms: [],
  };
  return { ...base, ...overrides };
}

function makeField(samples: VelocitySample[]): Tier4SimulationField {
  return {
    templateId: "tampines-greenweave",
    condition: { id: "ne_monsoon", label: "NE monsoon", compassDeg: 45, ambientWindMps: 2.4 },
    resolution: { width: 10, height: 8, units: "meters", sampleStepM: 1.2 },
    materialPreset: "monsoon_atelier_default",
    materialDefaults: {
      streamlines: { sumiInk: "#111111", silkRibbon: "#E5C37A" },
      particles: { cleanAir: "#D8A24A", pipeshaft: "#A79F93" },
      visibility: { minOpacity: 0.28, maxOpacity: 0.94 },
    },
    streamlines: [],
    particles: [],
    velocitySamples: samples,
    source: {
      kind: "prebaked_fallback",
      engine: "d2q9_lbm",
      adapter: "prebaked",
      grid: { width: 0, height: 0, iterations: 0 },
      webGpu: { available: false, implemented: false, reason: "test" },
    },
    simulationSource: {
      kind: "prebaked_fallback",
      engine: "d2q9_lbm",
      adapter: "prebaked",
      grid: { width: 0, height: 0, iterations: 0 },
      webGpu: { available: false, implemented: false, reason: "test" },
    },
    tier: "prototype_visualisation",
  };
}

describe("buildSceneElementSpec", () => {
  it("emits one curtain per operable window and skips doors", () => {
    const plan = makePlan();
    const field = makeField([{ x: 7, y: 0.2, vx: 0.2, vy: 1.4, speedMps: 1.4 }]);
    const spec = buildSceneElementSpec(plan, field);

    const curtainOpenings = spec.curtains.map((curtain) => curtain.openingId);
    assert.deepEqual(curtainOpenings.sort(), ["bedroom_window", "living_window"]);
    // The door opening must not produce a curtain.
    assert.equal(spec.curtains.find((curtain) => curtain.openingId === "main_door"), undefined);
  });

  it("classifies window orientation by long axis", () => {
    const plan = makePlan();
    const field = makeField([{ x: 7, y: 0.2, vx: 0.5, vy: 1.0, speedMps: 1.1 }]);
    const spec = buildSceneElementSpec(plan, field);

    const living = spec.curtains.find((curtain) => curtain.openingId === "living_window");
    const bedroom = spec.curtains.find((curtain) => curtain.openingId === "bedroom_window");
    assert.equal(living?.orientation, "horizontal");
    assert.equal(bedroom?.orientation, "vertical");
  });

  it("drives curtain sway from velocity normal to the opening", () => {
    const plan = makePlan();
    const field = makeField([
      { x: 7, y: 0, vx: 1.6, vy: 0.4, speedMps: 1.65 },
      { x: 0, y: 1.5, vx: -0.8, vy: 1.6, speedMps: 1.79 },
    ]);
    const spec = buildSceneElementSpec(plan, field);

    const living = spec.curtains.find((curtain) => curtain.openingId === "living_window");
    const bedroom = spec.curtains.find((curtain) => curtain.openingId === "bedroom_window");
    assert.equal(living?.swayDeg, 5.5);
    assert.equal(bedroom?.swayDeg, -11);
  });

  it("clamps sway angle below MAX_SWAY_DEG even when wind exceeds saturation", () => {
    const plan = makePlan();
    // Huge normal velocity well past the 1.6 m/s saturation threshold.
    const field = makeField([{ x: 7, y: 0.2, vx: 0.0, vy: 12.0, speedMps: 12.0 }]);
    const spec = buildSceneElementSpec(plan, field);
    const living = spec.curtains.find((curtain) => curtain.openingId === "living_window");
    assert.ok(living);
    assert.ok(Math.abs(living.swayDeg) <= 22, `sway ${living.swayDeg} should clamp to 22°`);
    assert.ok(Math.abs(living.swayDeg) >= 21.9, "saturation should reach the cap");
  });

  it("places leaves in the largest living room and largest bedroom", () => {
    const plan = makePlan();
    const field = makeField([{ x: 5.5, y: 0.5, vx: 0.4, vy: 0.4, speedMps: 0.6 }]);
    const spec = buildSceneElementSpec(plan, field);
    assert.equal(spec.leaves.length, 2);
    assert.deepEqual(spec.leaves.map((leaf) => leaf.id).sort(), ["leaf-bedroom", "leaf-living"]);
  });

  it("kitchen shadow frame index discretises velocity into 8 buckets", () => {
    const plan = makePlan();
    const calmField = makeField([{ x: 2, y: 5.5, vx: 0.05, vy: 0.05, speedMps: 0.07 }]);
    const briskField = makeField([{ x: 2, y: 5.5, vx: 1.1, vy: 1.1, speedMps: 1.55 }]);

    const calm = buildSceneElementSpec(plan, calmField).kitchenShadow;
    const brisk = buildSceneElementSpec(plan, briskField).kitchenShadow;

    assert.ok(calm);
    assert.ok(brisk);
    assert.equal(calm.frameIndex, 0);
    assert.ok(brisk.frameIndex >= SHADOW_FRAME_COUNT - 2);
    assert.ok(brisk.blendOpacity > calm.blendOpacity);
  });

  it("returns null kitchen shadow when no kitchen room exists", () => {
    const plan = makePlan({
      rooms: [
        { id: "living", label: "Living", kind: "living", confidence: "green", x: 0, y: 0, width: 5, height: 4 },
      ],
    });
    const field = makeField([{ x: 1, y: 1, vx: 0.5, vy: 0.5, speedMps: 0.7 }]);
    const spec = buildSceneElementSpec(plan, field);
    assert.equal(spec.kitchenShadow, null);
  });

  it("is deterministic for identical inputs", () => {
    const plan = makePlan();
    const field = makeField([{ x: 5, y: 0.2, vx: 0.4, vy: 1.2, speedMps: 1.27 }]);
    const a = buildSceneElementSpec(plan, field);
    const b = buildSceneElementSpec(plan, field);
    assert.deepEqual(a, b);
  });

  it("returns zero sway and rotation when no velocity samples are available", () => {
    const plan = makePlan();
    const field = makeField([]);
    const spec = buildSceneElementSpec(plan, field);
    for (const curtain of spec.curtains) {
      assert.equal(curtain.swayDeg, 0);
      assert.equal(curtain.speedMps, 0);
    }
    for (const leaf of spec.leaves) {
      assert.equal(leaf.rotationDeg, 0);
    }
    assert.equal(spec.kitchenShadow?.frameIndex, 0);
  });

  it("verifies every Phase 1 template supports kitchen shadow and Shaft Buffer demo mechanics", () => {
    for (const { templateId } of listGeometrySummaries()) {
      const plan = getPlanGeometry(templateId);
      const field = buildTier4Simulation({
        templateId,
        condition: "ne_monsoon_wind",
        tokenPlacements: [],
        candidatePositions: [],
      });
      const spec = buildSceneElementSpec(plan, field);
      const pipeshaft = plan.fixedElements.find((element) => element.kind === "pipeshaft_opening");

      assert.ok(spec.kitchenShadow, `${templateId} must support the perforated kitchen-partition shadow`);
      assert.ok(spec.kitchenShadow.bounds.width > 0, `${templateId} kitchen shadow must have positive width`);
      assert.ok(spec.kitchenShadow.bounds.height > 0, `${templateId} kitchen shadow must have positive height`);
      assert.ok(pipeshaft, `${templateId} must mark a pipeshaft opening`);
      assert.equal(pipeshaft.bufferEligible, true, `${templateId} pipeshaft must be Shaft Buffer eligible`);
      assert.equal(plan.pipeshaft.bufferRadiusM, 0.6, `${templateId} Shaft Buffer radius must remain 0.6m`);
    }
  });
});
