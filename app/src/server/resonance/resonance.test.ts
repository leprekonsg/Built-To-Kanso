import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { OpeningGeometry, PlanGeometry } from "@/server/geometry/types";
import { isSleepSuppressed } from "./sleepSuppress";
import { evaluateResonance } from "./resonance";
import type { WindReading } from "./types";

function makeOpening(
  id: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
): OpeningGeometry {
  return {
    id,
    kind: "window",
    roomIds: ["room-a"],
    start,
    end,
    operable: true,
  };
}

// Plan with a clear N-S corridor: corridor azimuth = 180°.
function nsPlan(): PlanGeometry {
  return {
    schemaVersion: 1,
    templateId: "tampines-greenweave",
    units: "meters",
    source: "architect_curated_template",
    bounds: { x: 0, y: 0, width: 10, height: 10 },
    openingAreaPct: 14,
    westSunFacadeDeg: 270,
    defaultDoorFacingDeg: 0,
    rooms: [],
    openings: [
      makeOpening("op-north", { x: 5, y: 0 }, { x: 5, y: 0 }),
      makeOpening("op-south", { x: 5, y: 10 }, { x: 5, y: 10 }),
    ],
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

function wind(directionDeg: number, speedMps: number): WindReading {
  return {
    directionDeg,
    speedMps,
    timestamp: "2026-05-09T05:00:00Z",
    source: "mock",
  };
}

// 14:00 SGT == 06:00 UTC; safely outside the 22:00–06:30 SGT suppression window.
const AWAKE_NOW = new Date("2026-05-09T06:00:00Z");

describe("evaluateResonance", () => {
  it("triggers when wind aligns within 15deg and speed >= 1.6 m/s on a non-ground floor", () => {
    const result = evaluateResonance({
      plan: nsPlan(),
      floor: 12, // golden tier
      lastNotifiedAtIso: null,
      recentNotificationsIso: [],
      now: AWAKE_NOW,
      wind: wind(190, 1.6), // 10° off the 180° corridor
    });
    assert.equal(result.resonating, true);
    assert.equal(result.shouldNotify, true);
    assert.equal(result.reason, "resonating");
  });

  it("does not trigger when wind is too calm", () => {
    const result = evaluateResonance({
      plan: nsPlan(),
      floor: 12,
      lastNotifiedAtIso: null,
      recentNotificationsIso: [],
      now: AWAKE_NOW,
      wind: wind(180, 0.5),
    });
    assert.equal(result.resonating, false);
    assert.equal(result.shouldNotify, false);
    assert.equal(result.reason, "wind_too_calm");
  });

  it("does not trigger below the Standard tier 1.6 m/s outdoor floor", () => {
    const result = evaluateResonance({
      plan: nsPlan(),
      floor: 12,
      lastNotifiedAtIso: null,
      recentNotificationsIso: [],
      now: AWAKE_NOW,
      wind: wind(180, 1.59),
    });
    assert.equal(result.resonating, false);
    assert.equal(result.reason, "wind_too_calm");
  });

  it("does not trigger when predicted indoor speed exceeds the Standard cap", () => {
    const result = evaluateResonance({
      plan: nsPlan(),
      floor: 12,
      lastNotifiedAtIso: null,
      recentNotificationsIso: [],
      now: AWAKE_NOW,
      wind: wind(180, 2.0),
      predictedIndoorSpeedMps: 0.26,
    });
    assert.equal(result.resonating, false);
    assert.equal(result.shouldNotify, false);
    assert.equal(result.reason, "indoor_draft_too_strong");
  });

  it("uses the Standard 6-hour cooldown after a notification", () => {
    const result = evaluateResonance({
      plan: nsPlan(),
      floor: 12,
      lastNotifiedAtIso: "2026-05-09T04:00:00Z",
      recentNotificationsIso: ["2026-05-09T04:00:00Z"],
      now: AWAKE_NOW,
      wind: wind(180, 2.0),
    });
    assert.equal(result.resonating, true);
    assert.equal(result.shouldNotify, false);
    assert.equal(result.reason, "cooldown_active");
    assert.equal(result.nextEligibleAt, "2026-05-09T10:00:00.000Z");
  });

  it("does not trigger when wind is misaligned (>15deg)", () => {
    const result = evaluateResonance({
      plan: nsPlan(),
      floor: 12,
      lastNotifiedAtIso: null,
      recentNotificationsIso: [],
      now: AWAKE_NOW,
      wind: wind(120, 3.0),
    });
    assert.equal(result.resonating, false);
    assert.equal(result.reason, "wind_not_aligned");
  });

  it("ground tier (floors 1-3) never notifies even when resonating", () => {
    const result = evaluateResonance({
      plan: nsPlan(),
      floor: 2,
      lastNotifiedAtIso: null,
      recentNotificationsIso: [],
      now: AWAKE_NOW,
      wind: wind(180, 2.0),
    });
    assert.equal(result.resonating, true);
    assert.equal(result.shouldNotify, false);
    assert.equal(result.reason, "ground_floor_silent");
  });

  it("golden tier enforces 3-per-7-day cap", () => {
    const recent = [
      "2026-05-08T08:00:00Z",
      "2026-05-08T10:00:00Z",
      "2026-05-08T12:00:00Z",
    ];
    const result = evaluateResonance({
      plan: nsPlan(),
      floor: 12,
      lastNotifiedAtIso: recent[2],
      recentNotificationsIso: recent,
      now: AWAKE_NOW,
      wind: wind(180, 2.0),
    });
    assert.equal(result.resonating, true);
    assert.equal(result.shouldNotify, false);
    assert.equal(result.reason, "cooldown_active");
    assert.ok(result.nextEligibleAt);
  });

  it("turbulent tier enforces 1-per-3-day cap", () => {
    const result = evaluateResonance({
      plan: nsPlan(),
      floor: 30,
      lastNotifiedAtIso: "2026-05-08T08:00:00Z",
      recentNotificationsIso: ["2026-05-08T08:00:00Z"],
      now: AWAKE_NOW,
      wind: wind(180, 2.0),
    });
    assert.equal(result.shouldNotify, false);
    assert.equal(result.reason, "cooldown_active");
  });

  it("transition tier (floor 5) allows the second notification once 7 days elapse", () => {
    const result = evaluateResonance({
      plan: nsPlan(),
      floor: 5,
      lastNotifiedAtIso: "2026-04-25T08:00:00Z", // > 7 days ago
      recentNotificationsIso: ["2026-04-25T08:00:00Z"],
      now: AWAKE_NOW,
      wind: wind(180, 2.0),
    });
    assert.equal(result.shouldNotify, true);
    assert.equal(result.reason, "resonating");
  });

  it("sleep-suppresses inside the 22:00-06:30 SGT window", () => {
    // 23:30 SGT == 15:30 UTC.
    const lateNight = new Date("2026-05-09T15:30:00Z");
    const result = evaluateResonance({
      plan: nsPlan(),
      floor: 12,
      lastNotifiedAtIso: null,
      recentNotificationsIso: [],
      now: lateNight,
      wind: wind(180, 2.0),
    });
    assert.equal(result.resonating, true);
    assert.equal(result.shouldNotify, false);
    assert.equal(result.reason, "sleep_suppressed");
    assert.ok(result.nextEligibleAt);
  });
});

describe("isSleepSuppressed flips at 22:00 and 06:30 SGT", () => {
  // 22:00 SGT == 14:00 UTC.
  it("is suppressed at exactly 22:00 SGT", () => {
    assert.equal(isSleepSuppressed(new Date("2026-05-09T14:00:00Z")), true);
  });

  it("is awake one minute before 22:00 SGT", () => {
    assert.equal(isSleepSuppressed(new Date("2026-05-09T13:59:00Z")), false);
  });

  it("is suppressed at 06:29 SGT", () => {
    // 06:29 SGT == 22:29 UTC the previous day.
    assert.equal(isSleepSuppressed(new Date("2026-05-08T22:29:00Z")), true);
  });

  it("is awake at exactly 06:30 SGT", () => {
    // 06:30 SGT == 22:30 UTC the previous day.
    assert.equal(isSleepSuppressed(new Date("2026-05-08T22:30:00Z")), false);
  });
});
