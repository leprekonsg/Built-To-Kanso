import { strict as assert } from "node:assert";
import { beforeEach, describe, it } from "node:test";
import type { OpeningGeometry, PlanGeometry } from "../geometry/types";
import {
  dispatchScheduledResonancePush,
  getDefaultPushSenderStatus,
  resetResonanceDispatchStateForTest,
  type PushSender,
} from "./dispatch";
import {
  clearSubscriptionsForTest,
  register,
} from "./subscriptions";
import type { PushSubscriptionLike } from "./subscriptions";
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

function sub(endpoint: string): PushSubscriptionLike {
  return {
    endpoint,
    keys: { p256dh: "p256dh", auth: "auth" },
  };
}

// Past the 24h opt-in grace window (AWAKE_NOW is 2026-05-09T06:00:00Z).
const ESTABLISHED_OPT_IN = "2026-05-07T06:00:00.000Z";

function registerEstablished(endpoint: string) {
  return register({ ...sub(endpoint), optInAtIso: ESTABLISHED_OPT_IN });
}

function wind(directionDeg: number, speedMps: number): WindReading {
  return {
    directionDeg,
    speedMps,
    timestamp: "2026-05-09T06:00:00Z",
    source: "mock",
  };
}

function fakeSender(failEndpoint?: string): PushSender {
  return {
    status: { available: true, status: "configured" },
    async send(subscription) {
      if (subscription.endpoint === failEndpoint) {
        const error = new Error("Gone") as Error & { statusCode: number };
        error.statusCode = 410;
        throw error;
      }
    },
  };
}

const AWAKE_NOW = new Date("2026-05-09T06:00:00Z");

describe("dispatchScheduledResonancePush", () => {
  beforeEach(() => {
    clearSubscriptionsForTest();
    resetResonanceDispatchStateForTest();
  });

  it("skips dispatch when Standard resonance eligibility fails", async () => {
    register(sub("https://push.example/sub-a"));

    const result = await dispatchScheduledResonancePush({
      plan: nsPlan(),
      floor: 12,
      now: AWAKE_NOW,
      wind: wind(90, 2),
      sender: fakeSender(),
    });

    assert.equal(result.status, "skipped");
    assert.equal(result.evaluation.shouldNotify, false);
    assert.equal(result.evaluation.reason, "wind_not_aligned");
    assert.equal(result.subscriptionCount, 1);
    assert.equal(result.sentCount, 0);
  });

  it("enforces the 6-hour cooldown across scheduled dispatch calls", async () => {
    registerEstablished("https://push.example/sub-a");

    const first = await dispatchScheduledResonancePush({
      plan: nsPlan(),
      floor: 12,
      now: AWAKE_NOW,
      wind: wind(180, 2),
      sender: fakeSender(),
    });
    const second = await dispatchScheduledResonancePush({
      plan: nsPlan(),
      floor: 12,
      now: new Date("2026-05-09T08:00:00Z"),
      wind: wind(180, 2),
      sender: fakeSender(),
    });

    assert.equal(first.status, "sent");
    assert.equal(first.sentCount, 1);
    assert.equal(second.status, "skipped");
    assert.equal(second.evaluation.reason, "cooldown_active");
    assert.equal(second.sentCount, 0);
  });

  it("reports subscription count and no-op status when there are no subscriptions", async () => {
    const result = await dispatchScheduledResonancePush({
      plan: nsPlan(),
      floor: 12,
      now: AWAKE_NOW,
      wind: wind(180, 2),
      sender: fakeSender(),
    });

    assert.equal(result.status, "no_subscriptions");
    assert.equal(result.subscriptionCount, 0);
    assert.equal(result.sentCount, 0);
    assert.equal(result.prunedCount, 0);
  });

  it("builds the quiet one-notification payload shape", async () => {
    registerEstablished("https://push.example/sub-a");
    const sentPayloads: unknown[] = [];
    const sender: PushSender = {
      status: { available: true, status: "configured" },
      async send(_subscription, payload) {
        sentPayloads.push(payload);
      },
    };

    const result = await dispatchScheduledResonancePush({
      plan: nsPlan(),
      floor: 12,
      now: AWAKE_NOW,
      wind: wind(180, 2),
      sender,
    });

    assert.equal(result.status, "sent");
    assert.deepEqual(sentPayloads, [
      {
        title: "Resonance Hours",
        body: "Your home is breathing right now.",
        url: "/threshold?resonance=now",
        tag: "resonance-hours",
        timestamp: "2026-05-09T06:00:00.000Z",
      },
    ]);
  });

  it("returns dry-run status without requiring a configured sender", async () => {
    const result = await dispatchScheduledResonancePush({
      plan: nsPlan(),
      floor: 12,
      now: AWAKE_NOW,
      wind: wind(180, 2),
      dryRun: true,
      sender: {
        status: {
          available: false,
          status: "not_configured",
          message: "Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.",
          missing: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"],
        },
        async send() {
          throw new Error("should not send");
        },
      },
    });

    assert.equal(result.status, "dry_run");
    assert.equal(result.attempted, false);
    assert.equal(result.senderStatus.status, "not_configured");
    assert.ok(result.payload);
  });

  it("reports not-configured status without pretending to send", async () => {
    registerEstablished("https://push.example/sub-a");

    const result = await dispatchScheduledResonancePush({
      plan: nsPlan(),
      floor: 12,
      now: AWAKE_NOW,
      wind: wind(180, 2),
      sender: {
        status: {
          available: false,
          status: "not_configured",
          message: "Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.",
          missing: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"],
        },
        async send() {
          throw new Error("should not send");
        },
      },
    });

    assert.equal(result.status, "not_configured");
    assert.equal(result.attempted, false);
    assert.equal(result.sentCount, 0);
    assert.equal(result.failedCount, 0);
  });

  it("treats invalid VAPID keys as not configured", async () => {
    const previousPublic = process.env.VAPID_PUBLIC_KEY;
    const previousPrivate = process.env.VAPID_PRIVATE_KEY;
    process.env.VAPID_PUBLIC_KEY = "invalid-public-key";
    process.env.VAPID_PRIVATE_KEY = "invalid-private-key";

    try {
      const status = await getDefaultPushSenderStatus();

      assert.equal(status.available, false);
      assert.equal(status.status, "not_configured");
      assert.match(status.message, /valid Web Push keypair/);
    } finally {
      restoreEnv("VAPID_PUBLIC_KEY", previousPublic);
      restoreEnv("VAPID_PRIVATE_KEY", previousPrivate);
    }
  });

  it("prunes subscriptions that fail with permanent Web Push endpoint status", async () => {
    registerEstablished("https://push.example/sub-ok");
    registerEstablished("https://push.example/sub-gone");

    const result = await dispatchScheduledResonancePush({
      plan: nsPlan(),
      floor: 12,
      now: AWAKE_NOW,
      wind: wind(180, 2),
      sender: fakeSender("https://push.example/sub-gone"),
    });

    assert.equal(result.status, "partial_failure");
    assert.equal(result.subscriptionCount, 2);
    assert.equal(result.sentCount, 1);
    assert.equal(result.failedCount, 1);
    assert.equal(result.prunedCount, 1);
  });
});

function restoreEnv(name: "VAPID_PUBLIC_KEY" | "VAPID_PRIVATE_KEY", value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
