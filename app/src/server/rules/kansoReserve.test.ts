import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlanGeometry } from "@/server/geometry/types";
import type { TokenPlacement } from "@/server/rules/tokens";
import { evaluateKansoReserve } from "./kansoReserve";

function makePlan(overrides?: Partial<PlanGeometry>): PlanGeometry {
  const base: PlanGeometry = {
    schemaVersion: 1,
    templateId: "tampines-greenweave",
    units: "meters",
    source: "architect_curated_template",
    bounds: { x: 0, y: 0, width: 10, height: 10 },
    openingAreaPct: 14,
    westSunFacadeDeg: 270,
    defaultDoorFacingDeg: 45,
    rooms: [
      { id: "living", label: "Living", kind: "living", confidence: "green", x: 0, y: 0, width: 5, height: 4 },
      { id: "main_bedroom", label: "Main Bedroom", kind: "bedroom", confidence: "green", x: 5, y: 0, width: 4, height: 4 },
      { id: "kitchen", label: "Kitchen", kind: "kitchen", confidence: "green", x: 0, y: 4, width: 4, height: 3 },
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

describe("evaluateKansoReserve", () => {
  it("reports healthy band on an empty plan with no fixed elements or tokens", () => {
    const reading = evaluateKansoReserve(makePlan(), []);
    assert.equal(reading.reservePct, 100);
    assert.equal(reading.status, "healthy");
    assert.equal(reading.tier, "heuristic_estimate");
    assert.match(reading.recommendation, /breathing/);
  });

  it("drops to crowded when fixed elements consume most of the floor area", () => {
    const plan = makePlan({
      fixedElements: [
        // 48 m^2 of "fixed" footprint on a 48 m^2 plan ~ 0% empty.
        {
          id: "huge",
          kind: "structural_wall",
          confidence: "black",
          x: 0,
          y: 0,
          width: 8,
          height: 6,
        },
      ],
    });
    const reading = evaluateKansoReserve(plan, []);
    assert.equal(reading.reservePct, 0);
    assert.equal(reading.status, "crowded");
    assert.match(reading.recommendation, /asking for less/);
  });

  it("crosses the watch band when occupation lands between 65 and 72 percent empty", () => {
    // Total floor area = 48 m^2. Need ~30% occupied to get reservePct ~70.
    // 14.4 m^2 fixed = 30% of 48.
    const plan = makePlan({
      fixedElements: [
        {
          id: "block",
          kind: "wet_zone",
          confidence: "black",
          x: 0,
          y: 0,
          width: 4,
          height: 3.6,
        },
      ],
    });
    const reading = evaluateKansoReserve(plan, []);
    assert.equal(reading.status, "watch");
    assert.ok(reading.reservePct >= 65 && reading.reservePct <= 72, `got ${reading.reservePct}`);
    assert.match(reading.recommendation, /one less object/);
  });

  it("counts each placed token as a ~1.13 m^2 footprint", () => {
    const plan = makePlan();
    const noTokens = evaluateKansoReserve(plan, []);
    const placements: TokenPlacement[] = [
      { tokenId: "wind_gate", point: { x: 1, y: 1 } },
      { tokenId: "soft_screen", point: { x: 2, y: 2 } },
      { tokenId: "wood_anchor", point: { x: 3, y: 3 } },
    ];
    const withTokens = evaluateKansoReserve(plan, placements);
    assert.ok(withTokens.reservePct < noTokens.reservePct);
    assert.ok(noTokens.reservePct - withTokens.reservePct >= 5);
  });

  it("holds the healthy band exactly at 73 percent empty", () => {
    // 48 m^2 total; 27% occupied = 12.96 m^2 fixed.
    const plan = makePlan({
      fixedElements: [
        {
          id: "block",
          kind: "wet_zone",
          confidence: "black",
          x: 0,
          y: 0,
          width: 4,
          height: 3.24,
        },
      ],
    });
    const reading = evaluateKansoReserve(plan, []);
    assert.equal(reading.status, "healthy");
    assert.ok(reading.reservePct >= 73);
  });
});
