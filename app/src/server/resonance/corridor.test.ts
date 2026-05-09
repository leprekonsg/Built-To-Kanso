import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { OpeningGeometry, PlanGeometry } from "@/server/geometry/types";
import { computeCrossVentCorridor } from "./corridor";

function makeOpening(
  id: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
  operable = true,
): OpeningGeometry {
  return {
    id,
    kind: "window",
    roomIds: ["room-a"],
    start,
    end,
    operable,
  };
}

function makePlan(openings: OpeningGeometry[]): PlanGeometry {
  return {
    schemaVersion: 1,
    templateId: "tampines-greenweave",
    units: "meters",
    source: "architect_curated_template",
    bounds: { x: 0, y: 0, width: 10, height: 10 },
    openingAreaPct: 12,
    westSunFacadeDeg: 270,
    defaultDoorFacingDeg: 0,
    rooms: [],
    openings,
    fixedElements: [],
    pipeshaft: {
      id: "shaft-1",
      roomId: "room-a",
      openingPoint: { x: 0, y: 0 },
      openingDirectionDeg: 0,
      jetVelocityMps: [0, 0],
      bufferRadiusM: 0,
      downwindRoomIds: [],
    },
    bathrooms: [],
  };
}

describe("computeCrossVentCorridor", () => {
  it("returns null when fewer than 2 operable openings", () => {
    const plan = makePlan([makeOpening("o1", { x: 0, y: 0 }, { x: 1, y: 0 })]);
    assert.equal(computeCrossVentCorridor(plan), null);
  });

  it("ignores non-operable openings when picking the pair", () => {
    // The widest pair includes a non-operable door — the corridor must skip it.
    const plan = makePlan([
      makeOpening("op-north", { x: 4, y: 0 }, { x: 6, y: 0 }, true),
      makeOpening("op-south", { x: 4, y: 10 }, { x: 6, y: 10 }, true),
      makeOpening("door-far", { x: 0, y: 5 }, { x: 0, y: 5 }, false),
    ]);
    const corridor = computeCrossVentCorridor(plan);
    assert.ok(corridor);
    assert.deepEqual([...corridor.openingIds].sort(), ["op-north", "op-south"]);
  });

  it("computes azimuth for a north-south pair (south = 180deg)", () => {
    // Opening at top of plan (y=0, north edge) and bottom (y=10, south edge).
    // Bearing from north midpoint to south midpoint should be 180°.
    const plan = makePlan([
      makeOpening("op-north", { x: 5, y: 0 }, { x: 5, y: 0 }, true),
      makeOpening("op-south", { x: 5, y: 10 }, { x: 5, y: 10 }, true),
    ]);
    const corridor = computeCrossVentCorridor(plan);
    assert.ok(corridor);
    assert.equal(corridor.azimuthDeg, 180);
    assert.equal(corridor.spanM, 10);
  });

  it("picks the widest-span pair among multiple operable openings", () => {
    const plan = makePlan([
      makeOpening("near-a", { x: 4, y: 0 }, { x: 4, y: 0 }, true),
      makeOpening("near-b", { x: 5, y: 0 }, { x: 5, y: 0 }, true),
      makeOpening("far", { x: 5, y: 10 }, { x: 5, y: 10 }, true),
    ]);
    const corridor = computeCrossVentCorridor(plan);
    assert.ok(corridor);
    assert.deepEqual([...corridor.openingIds].sort(), ["far", "near-a"]);
  });

  it("avoids first-opening ambiguity by using a deterministic tie-break", () => {
    const plan = makePlan([
      makeOpening("z-west", { x: 0, y: 5 }, { x: 0, y: 5 }, true),
      makeOpening("a-east", { x: 10, y: 5 }, { x: 10, y: 5 }, true),
      makeOpening("m-north", { x: 5, y: 0 }, { x: 5, y: 0 }, true),
      makeOpening("n-south", { x: 5, y: 10 }, { x: 5, y: 10 }, true),
    ]);
    const corridor = computeCrossVentCorridor(plan);
    assert.ok(corridor);
    assert.deepEqual(corridor.openingIds, ["a-east", "z-west"]);
    assert.equal(corridor.azimuthDeg, 270);
  });
});
