import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlanGeometry } from "@/server/geometry/types";
import type { ScoutPassResult } from "@/server/scout/scout";
import { recommendAntiCure } from "./antiCure";

function makePlan(overrides?: Partial<PlanGeometry>): PlanGeometry {
  const base: PlanGeometry = {
    schemaVersion: 1,
    templateId: "tampines-greenweave",
    units: "meters",
    source: "architect_curated_template",
    bounds: { x: 0, y: 0, width: 10, height: 10 },
    openingAreaPct: 14,
    westSunFacadeDeg: 90, // east-facing, so no west-sun rooms by default
    defaultDoorFacingDeg: 45,
    rooms: [
      { id: "living_small", label: "Living Small", kind: "living", confidence: "green", x: 2, y: 0, width: 3, height: 3 },
      { id: "living_large", label: "Living Large", kind: "living", confidence: "green", x: 5, y: 0, width: 5, height: 4 },
      { id: "main_bedroom", label: "Main Bedroom", kind: "bedroom", confidence: "green", x: 0, y: 4, width: 4, height: 4 },
    ],
    openings: [],
    fixedElements: [],
    pipeshaft: {
      id: "shaft",
      roomId: "kitchen",
      openingPoint: { x: 1, y: 5 },
      openingDirectionDeg: 0,
      jetVelocityMps: [0.15, 0.25],
      bufferRadiusM: 0.6,
      downwindRoomIds: [],
    },
    bathrooms: [],
  };
  return { ...base, ...overrides };
}

const emptyScout: ScoutPassResult = {
  askingPoints: [],
  dampRisk: [],
  openingAreaBadge: {
    areaPct: 14,
    status: "capable",
    recommendedTokenId: "wind_gate",
    recommendation: "Use a Wind Gate to tune the existing cross-breeze.",
    tier: "heuristic_estimate",
  },
};

describe("recommendAntiCure", () => {
  it("picks the largest eligible living room", () => {
    const reading = recommendAntiCure(makePlan(), emptyScout);
    assert.ok(reading);
    assert.equal(reading.roomId, "living_large");
    assert.equal(reading.label, "Living Large");
    assert.match(reading.recommendation, /ninety days/);
    assert.equal(reading.tier, "heuristic_estimate");
  });

  it("returns null when there are no living-kind rooms", () => {
    const plan = makePlan({
      rooms: [
        { id: "main_bedroom", label: "Main Bedroom", kind: "bedroom", confidence: "green", x: 0, y: 0, width: 4, height: 4 },
        { id: "kitchen", label: "Kitchen", kind: "kitchen", confidence: "green", x: 4, y: 0, width: 3, height: 3 },
      ],
    });
    const reading = recommendAntiCure(plan, emptyScout);
    assert.equal(reading, null);
  });

  it("excludes living rooms hugging the west-sun facade", () => {
    const plan = makePlan({
      westSunFacadeDeg: 270,
      rooms: [
        // Hugs the west bound (x = bounds.x); should be excluded.
        { id: "living_west", label: "Living West", kind: "living", confidence: "green", x: 0, y: 0, width: 6, height: 5 },
        // Sits inland.
        { id: "living_inner", label: "Living Inner", kind: "living", confidence: "green", x: 6, y: 0, width: 3, height: 3 },
      ],
    });
    const reading = recommendAntiCure(plan, emptyScout);
    assert.ok(reading);
    assert.equal(reading.roomId, "living_inner");
  });

  it("skips rooms named in the asking points", () => {
    const plan = makePlan();
    const scout: ScoutPassResult = {
      ...emptyScout,
      askingPoints: [
        {
          id: "damp-living_large",
          scout: "damp",
          copy: "Damp Risk wants a buffer.",
          designerDetail: "...",
          tier: "heuristic_estimate",
        },
      ],
    };
    const reading = recommendAntiCure(plan, scout);
    assert.ok(reading);
    assert.equal(reading.roomId, "living_small");
  });
});
