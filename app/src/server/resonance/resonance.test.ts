import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { OpeningGeometry, PlanGeometry } from "@/server/geometry/types";
import {
  isSleepSuppressed,
  isSleepSuppressedFor,
  nextWakeAfterFor,
} from "./sleepSuppress";
import { defaultFrequencyTierForFloor, floorToTier } from "./floorTier";
import {
  evaluateResonance,
  MIN_NOTIFICATION_SPACING_HOURS,
  OPT_IN_GRACE_HOURS,
  RESONANCE_THRESHOLDS_BY_TIER,
} from "./resonance";
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

// 14:00 SGT == 06:00 UTC; safely outside the 22:00-07:00 SGT suppression window.
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

  it("sleep-suppresses inside the 22:00-07:00 SGT window", () => {
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

describe("isSleepSuppressed flips at 22:00 and 07:00 SGT", () => {
  // 22:00 SGT == 14:00 UTC.
  it("is suppressed at exactly 22:00 SGT", () => {
    assert.equal(isSleepSuppressed(new Date("2026-05-09T14:00:00Z")), true);
  });

  it("is awake one minute before 22:00 SGT", () => {
    assert.equal(isSleepSuppressed(new Date("2026-05-09T13:59:00Z")), false);
  });

  it("is suppressed at 06:59 SGT", () => {
    // 06:59 SGT == 22:59 UTC the previous day.
    assert.equal(isSleepSuppressed(new Date("2026-05-08T22:59:00Z")), true);
  });

  it("is awake at exactly 07:00 SGT", () => {
    // 07:00 SGT == 23:00 UTC the previous day.
    assert.equal(isSleepSuppressed(new Date("2026-05-08T23:00:00Z")), false);
  });
});

describe("frequency tier thresholds", () => {
  // Wind exactly at the boundary the Standard tier accepts but Calm rejects.
  it("Calm rejects what Standard accepts (alignment 13deg, speed 1.7 m/s)", () => {
    const standardOk = evaluateResonance({
      plan: nsPlan(),
      floor: 12,
      lastNotifiedAtIso: null,
      recentNotificationsIso: [],
      now: AWAKE_NOW,
      wind: wind(193, 1.7), // 13deg off corridor
      tier: "standard",
    });
    assert.equal(standardOk.shouldNotify, true);

    const calmRejects = evaluateResonance({
      plan: nsPlan(),
      floor: 12,
      lastNotifiedAtIso: null,
      recentNotificationsIso: [],
      now: AWAKE_NOW,
      wind: wind(193, 1.7),
      tier: "calm",
    });
    assert.equal(calmRejects.shouldNotify, false);
    assert.equal(calmRejects.reason, "wind_not_aligned");
  });

  it("Calm uses the brief's 0.20 m/s predicted-indoor cap", () => {
    const result = evaluateResonance({
      plan: nsPlan(),
      floor: 12,
      lastNotifiedAtIso: null,
      recentNotificationsIso: [],
      now: AWAKE_NOW,
      wind: wind(180, 2.0),
      predictedIndoorSpeedMps: 0.21,
      tier: "calm",
    });
    assert.equal(result.shouldNotify, false);
    assert.equal(result.reason, "indoor_draft_too_strong");
  });

  it("Active accepts what Standard rejects (speed 1.4 m/s)", () => {
    const standardRejects = evaluateResonance({
      plan: nsPlan(),
      floor: 12,
      lastNotifiedAtIso: null,
      recentNotificationsIso: [],
      now: AWAKE_NOW,
      wind: wind(180, 1.4),
      tier: "standard",
    });
    assert.equal(standardRejects.shouldNotify, false);
    assert.equal(standardRejects.reason, "wind_too_calm");

    const activeOk = evaluateResonance({
      plan: nsPlan(),
      floor: 12,
      lastNotifiedAtIso: null,
      recentNotificationsIso: [],
      now: AWAKE_NOW,
      wind: wind(180, 1.4),
      tier: "active",
    });
    assert.equal(activeOk.shouldNotify, true);
  });

  it("Active uses the brief's 1.2 m/s floor and no predicted-indoor cap", () => {
    const result = evaluateResonance({
      plan: nsPlan(),
      floor: 12,
      lastNotifiedAtIso: null,
      recentNotificationsIso: [],
      now: AWAKE_NOW,
      wind: wind(200, 1.2), // 20deg off corridor, exactly Active's edge.
      predictedIndoorSpeedMps: 0.8,
      tier: "active",
    });
    assert.equal(result.shouldNotify, true);
    assert.equal(result.reason, "resonating");
  });

  it("Calm uses a 12h cooldown", () => {
    // 8h after the last ping — Standard would fire, Calm should still hold.
    const result = evaluateResonance({
      plan: nsPlan(),
      floor: 12,
      lastNotifiedAtIso: "2026-05-08T22:00:00Z",
      recentNotificationsIso: ["2026-05-08T22:00:00Z"],
      now: new Date("2026-05-09T06:00:00Z"),
      wind: wind(180, 2.0),
      tier: "calm",
    });
    assert.equal(result.shouldNotify, false);
    assert.equal(result.reason, "cooldown_active");
  });

  it("exposes the brief's Active 4h tier value but enforces the hard-rule 6h notification floor", () => {
    assert.equal(RESONANCE_THRESHOLDS_BY_TIER.active.cooldownHours, 4);
    assert.equal(MIN_NOTIFICATION_SPACING_HOURS, 6);

    const result = evaluateResonance({
      plan: nsPlan(),
      floor: 12,
      lastNotifiedAtIso: "2026-05-09T01:00:00Z",
      recentNotificationsIso: ["2026-05-09T01:00:00Z"],
      now: AWAKE_NOW,
      wind: wind(180, 2.0),
      tier: "active",
    });
    assert.equal(result.shouldNotify, false);
    assert.equal(result.reason, "cooldown_active");
    assert.equal(result.nextEligibleAt, "2026-05-09T07:00:00.000Z");
  });
});

describe("floor tier bands", () => {
  it("matches the brief's 1-3, 4-8, 9-15, 16+ floor bands", () => {
    assert.equal(floorToTier(3), "ground");
    assert.equal(floorToTier(4), "transition");
    assert.equal(floorToTier(8), "transition");
    assert.equal(floorToTier(9), "golden");
    assert.equal(floorToTier(15), "golden");
    assert.equal(floorToTier(16), "turbulent");
  });

  it("defaults turbulent floors to Calm frequency and other floors to Standard", () => {
    assert.equal(defaultFrequencyTierForFloor(15), "standard");
    assert.equal(defaultFrequencyTierForFloor(16), "calm");
  });

  it("uses the floor-band default when no frequency tier is supplied", () => {
    const result = evaluateResonance({
      plan: nsPlan(),
      floor: 16,
      lastNotifiedAtIso: null,
      recentNotificationsIso: [],
      now: AWAKE_NOW,
      wind: wind(193, 1.7), // Standard accepts 13deg; Calm rejects it.
    });
    assert.equal(result.shouldNotify, false);
    assert.equal(result.reason, "wind_not_aligned");
  });
});

describe("24h opt-in grace", () => {
  it("blocks notifications inside the 24h grace window", () => {
    const optInAtIso = "2026-05-09T05:30:00Z"; // 30 minutes before now
    const result = evaluateResonance({
      plan: nsPlan(),
      floor: 12,
      lastNotifiedAtIso: null,
      recentNotificationsIso: [],
      now: AWAKE_NOW,
      wind: wind(180, 2.0),
      optInAtIso,
    });
    assert.equal(result.resonating, true);
    assert.equal(result.shouldNotify, false);
    assert.equal(result.reason, "opt_in_grace");
    assert.equal(result.nextEligibleAt, "2026-05-10T05:30:00.000Z");
  });

  it("permits notifications once the 24h grace window elapses", () => {
    const now = new Date("2026-05-09T06:00:00Z");
    const optInAtIso = new Date(now.getTime() - (OPT_IN_GRACE_HOURS + 1) * 60 * 60 * 1000).toISOString();
    const result = evaluateResonance({
      plan: nsPlan(),
      floor: 12,
      lastNotifiedAtIso: null,
      recentNotificationsIso: [],
      now,
      wind: wind(180, 2.0),
      optInAtIso,
    });
    assert.equal(result.shouldNotify, true);
  });
});

describe("user-configurable sleep window", () => {
  it("respects a 23:00-06:00 SGT override (suppresses at 23:30 SGT)", () => {
    const lateNight = new Date("2026-05-09T15:30:00Z"); // 23:30 SGT
    const result = evaluateResonance({
      plan: nsPlan(),
      floor: 12,
      lastNotifiedAtIso: null,
      recentNotificationsIso: [],
      now: lateNight,
      wind: wind(180, 2.0),
      sleepWindow: {
        sleepStartHourSgt: 23,
        sleepStartMinuteSgt: 0,
        sleepEndHourSgt: 6,
        sleepEndMinuteSgt: 0,
      },
    });
    assert.equal(result.reason, "sleep_suppressed");
  });

  it("a 23:00-06:00 SGT override is awake at 22:30 SGT (default would suppress)", () => {
    const at = new Date("2026-05-09T14:30:00Z"); // 22:30 SGT
    assert.equal(
      isSleepSuppressedFor(at, {
        sleepStartHourSgt: 23,
        sleepStartMinuteSgt: 0,
        sleepEndHourSgt: 6,
        sleepEndMinuteSgt: 0,
      }),
      false,
    );
    // The default window does suppress at 22:30 SGT.
    assert.equal(isSleepSuppressed(at), true);
  });

  it("nextWakeAfterFor returns the upcoming end of the configured window", () => {
    // 23:30 SGT 2026-05-09 → next wake at 06:00 SGT 2026-05-10 == 22:00 UTC 2026-05-09.
    const at = new Date("2026-05-09T15:30:00Z");
    const wake = nextWakeAfterFor(at, {
      sleepStartHourSgt: 23,
      sleepStartMinuteSgt: 0,
      sleepEndHourSgt: 6,
      sleepEndMinuteSgt: 0,
    });
    assert.equal(wake.toISOString(), "2026-05-09T22:00:00.000Z");
  });

  it("handles a same-day window (02:00-05:00 SGT)", () => {
    // 03:00 SGT == 19:00 UTC previous day.
    const inside = new Date("2026-05-08T19:00:00Z");
    assert.equal(
      isSleepSuppressedFor(inside, {
        sleepStartHourSgt: 2,
        sleepStartMinuteSgt: 0,
        sleepEndHourSgt: 5,
        sleepEndMinuteSgt: 0,
      }),
      true,
    );
    // 06:00 SGT == 22:00 UTC previous day — outside the same-day window.
    const outside = new Date("2026-05-08T22:00:00Z");
    assert.equal(
      isSleepSuppressedFor(outside, {
        sleepStartHourSgt: 2,
        sleepStartMinuteSgt: 0,
        sleepEndHourSgt: 5,
        sleepEndMinuteSgt: 0,
      }),
      false,
    );
  });
});

describe("alignmentEventId on the evaluation", () => {
  it("populates alignmentEventId when resonating", () => {
    const result = evaluateResonance({
      plan: nsPlan(),
      floor: 12,
      lastNotifiedAtIso: null,
      recentNotificationsIso: [],
      now: AWAKE_NOW,
      wind: wind(180, 2.0),
    });
    assert.equal(result.shouldNotify, true);
    assert.match(result.alignmentEventId ?? "", /^[0-9a-f]{16}$/);
  });

  it("returns null alignmentEventId when wind is misaligned", () => {
    const result = evaluateResonance({
      plan: nsPlan(),
      floor: 12,
      lastNotifiedAtIso: null,
      recentNotificationsIso: [],
      now: AWAKE_NOW,
      wind: wind(90, 2.0),
    });
    assert.equal(result.resonating, false);
    assert.equal(result.alignmentEventId, null);
  });

  it("keeps alignmentEventId stable across two polls 60s apart", () => {
    const a = evaluateResonance({
      plan: nsPlan(),
      floor: 12,
      lastNotifiedAtIso: null,
      recentNotificationsIso: [],
      now: AWAKE_NOW,
      wind: wind(180, 2.0),
    });
    const b = evaluateResonance({
      plan: nsPlan(),
      floor: 12,
      lastNotifiedAtIso: null,
      recentNotificationsIso: [],
      now: new Date(AWAKE_NOW.getTime() + 60_000),
      wind: wind(180, 2.0),
    });
    assert.equal(a.alignmentEventId, b.alignmentEventId);
  });

  it("regenerates alignmentEventId when wind drifts past the 10deg bucket", () => {
    const a = evaluateResonance({
      plan: nsPlan(),
      floor: 12,
      lastNotifiedAtIso: null,
      recentNotificationsIso: [],
      now: AWAKE_NOW,
      wind: wind(178, 2.0),
    });
    const b = evaluateResonance({
      plan: nsPlan(),
      floor: 12,
      lastNotifiedAtIso: null,
      recentNotificationsIso: [],
      now: AWAKE_NOW,
      wind: wind(192, 2.0), // still inside corridor tolerance, different bucket
    });
    assert.equal(a.shouldNotify, true);
    assert.equal(b.shouldNotify, true);
    assert.notEqual(a.alignmentEventId, b.alignmentEventId);
  });

  it("ground floor still emits an alignmentEventId for diagnostic surfacing", () => {
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
    assert.match(result.alignmentEventId ?? "", /^[0-9a-f]{16}$/);
  });
});
