import { strict as assert } from "node:assert";
import { beforeEach, describe, it } from "node:test";
import {
  clearForTest,
  count,
  countByTier,
  get,
  getByEndpoint,
  list,
  recordNotification,
  register,
  unregister,
  unregisterByEndpoint,
  updateSettings,
} from "./subscriptions";

describe("UserSubscription store", () => {
  beforeEach(() => {
    clearForTest();
  });

  it("derives a stable userId from endpoint when none is supplied (back-compat)", () => {
    const a = register({ endpoint: "https://push.example/sub-a" });
    const b = register({ endpoint: "https://push.example/sub-a" });
    assert.equal(a.userId, b.userId);
    assert.match(a.userId, /^anon-/);
    assert.equal(a.frequencyTier, "standard");
    assert.equal(a.sleepStartHourSgt, 22);
    assert.equal(a.sleepEndHourSgt, 7);
    assert.equal(a.sleepEndMinuteSgt, 0);
    assert.equal(a.status, "active");
  });

  it("respects an explicit userId and supplied tier/sleep window", () => {
    const record = register({
      endpoint: "https://push.example/sub-a",
      userId: "user-1",
      frequencyTier: "calm",
      sleepStartHourSgt: 23,
      sleepEndHourSgt: 6,
    });
    assert.equal(record.userId, "user-1");
    assert.equal(record.frequencyTier, "calm");
    assert.equal(record.sleepStartHourSgt, 23);
    assert.equal(record.sleepEndHourSgt, 6);
  });

  it("rejects empty endpoints, invalid tiers, and out-of-range hours", () => {
    assert.throws(() => register({ endpoint: "" }), /non-empty endpoint/);
    assert.throws(
      () => register({ endpoint: "x", frequencyTier: "blast" as never }),
      /frequencyTier/,
    );
    assert.throws(
      () => register({ endpoint: "x", sleepStartHourSgt: 24 }),
      /sleep window hours/,
    );
    assert.throws(
      () => register({ endpoint: "x", sleepEndMinuteSgt: 60 }),
      /sleep window minutes/,
    );
  });

  it("supports the register -> updateSettings -> unregister -> re-register cycle", () => {
    const reg1 = register({
      endpoint: "https://push.example/sub-a",
      userId: "user-1",
    });
    assert.equal(reg1.frequencyTier, "standard");
    assert.equal(reg1.optInAtIso, reg1.optInAtIso); // truthy

    const updated = updateSettings("user-1", {
      frequencyTier: "active",
      sleepStartHourSgt: 21,
    });
    assert.ok(updated);
    assert.equal(updated.frequencyTier, "active");
    assert.equal(updated.sleepStartHourSgt, 21);

    assert.equal(unregister("user-1"), true);
    assert.equal(get("user-1"), null);
    assert.equal(getByEndpoint("https://push.example/sub-a"), null);

    // Re-register with the same endpoint resets opt-in time and clears history.
    const reg2 = register({
      endpoint: "https://push.example/sub-a",
      userId: "user-1",
    });
    assert.equal(reg2.lastNotifiedAtIso, null);
    assert.equal(reg2.recentNotificationsIso.length, 0);
    assert.equal(reg2.frequencyTier, "standard");
  });

  it("unregister and unregisterByEndpoint are idempotent", () => {
    register({ endpoint: "https://push.example/sub-a", userId: "user-1" });
    assert.equal(unregisterByEndpoint("https://push.example/sub-a"), true);
    assert.equal(unregisterByEndpoint("https://push.example/sub-a"), false);
    assert.equal(unregister("user-1"), false);
  });

  it("recordNotification stores the latest ping and caps recent history at 30", () => {
    register({ endpoint: "https://push.example/sub-a", userId: "user-1" });
    for (let i = 0; i < 35; i += 1) {
      recordNotification(
        "user-1",
        new Date(Date.UTC(2026, 0, 1, 0, i, 0)).toISOString(),
      );
    }
    const record = get("user-1");
    assert.ok(record);
    assert.equal(record.recentNotificationsIso.length, 30);
    assert.equal(record.lastNotifiedAtIso, "2026-01-01T00:34:00.000Z");
  });

  it("countByTier reports active subscribers grouped by tier", () => {
    register({ endpoint: "ep-1", userId: "u-1", frequencyTier: "calm" });
    register({ endpoint: "ep-2", userId: "u-2", frequencyTier: "calm" });
    register({ endpoint: "ep-3", userId: "u-3", frequencyTier: "standard" });
    register({ endpoint: "ep-4", userId: "u-4", frequencyTier: "active" });

    assert.deepEqual(countByTier(), { calm: 2, standard: 1, active: 1 });
    assert.equal(count({ status: "active" }), 4);
    assert.equal(list({ tier: "calm" }).length, 2);
  });
});
