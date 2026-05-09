import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlanGeometry } from "@/server/geometry/types";
import { evaluateGlow } from "./glow";

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
      { id: "living", label: "Living", kind: "living", confidence: "green", x: 0, y: 0, width: 5, height: 4 },
      { id: "bedroom", label: "Bedroom", kind: "bedroom", confidence: "green", x: 5, y: 0, width: 5, height: 4 },
      { id: "kitchen", label: "Kitchen", kind: "kitchen", confidence: "green", x: 0, y: 4, width: 4, height: 4 },
    ],
    openings: [
      {
        id: "living_west_window",
        kind: "window",
        roomIds: ["living"],
        start: { x: 0, y: 0.6 },
        end: { x: 0, y: 3.4 },
        operable: true,
      },
      {
        id: "bedroom_east_window",
        kind: "window",
        roomIds: ["bedroom"],
        start: { x: 10, y: 0.6 },
        end: { x: 10, y: 2.6 },
        operable: true,
      },
    ],
    fixedElements: [],
    pipeshaft: {
      id: "shaft",
      roomId: "kitchen",
      openingPoint: { x: 1, y: 6 },
      openingDirectionDeg: 0,
      jetVelocityMps: [0.15, 0.25],
      bufferRadiusM: 0.6,
      downwindRoomIds: [],
    },
    bathrooms: [],
  };
  return { ...base, ...overrides };
}

describe("evaluateGlow", () => {
  it("uses the Singapore west-sun window and SHGC target when the facade is exposed", () => {
    const reading = evaluateGlow({ plan: makePlan(), compassDeg: 270, floor: 16 });

    assert.deepEqual(reading.westSunWindow, {
      start: "16:00",
      end: "18:30",
      timezone: "Asia/Singapore",
    });
    assert.equal(reading.targetShgcMax, 0.3);
    assert.equal(reading.recommendedTokenId, "solar_shield");
    assert.equal(reading.tier, "heuristic_estimate");
    assert.ok(reading.solarWashScore >= 40, `got ${reading.solarWashScore}`);
    assert.match(reading.designerSummary, /SHGC <=0\.30/);
  });

  it("raises the solar wash score with floor height and exposed west-facing window length", () => {
    const lowFloorSmallWindow = evaluateGlow({
      plan: makePlan({
        openings: [
          {
            id: "small_west_window",
            kind: "window",
            roomIds: ["living"],
            start: { x: 0, y: 1 },
            end: { x: 0, y: 1.8 },
            operable: true,
          },
        ],
      }),
      compassDeg: 270,
      floor: 2,
    });

    const highFloorLargeWindow = evaluateGlow({ plan: makePlan(), compassDeg: 270, floor: 20 });

    assert.ok(highFloorLargeWindow.exposedWindowLengthM > lowFloorSmallWindow.exposedWindowLengthM);
    assert.ok(highFloorLargeWindow.solarWashScore > lowFloorSmallWindow.solarWashScore);
  });

  it("keeps non-west orientation calm and caps Asking Points at three", () => {
    const reading = evaluateGlow({ plan: makePlan(), compassDeg: 90, floor: 30 });

    assert.equal(reading.band, "settled");
    assert.equal(reading.solarWashScore, 0);
    assert.ok(reading.askingPoints.length <= 3);
    assert.doesNotMatch(
      `${reading.culturalSummary} ${reading.designerSummary} ${reading.askingPoints.map((point) => point.copy).join(" ")}`,
      /danger|severe|critical|emergency/i,
    );
  });
});
