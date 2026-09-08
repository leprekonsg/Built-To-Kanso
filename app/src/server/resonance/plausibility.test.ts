import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { getPlanGeometry, listGeometrySummaries } from "@/server/geometry/registry";
import type { PlanGeometry } from "@/server/geometry/types";
import { computeCrossVentCorridor } from "./corridor";
import { evaluateResonance } from "./resonance";
import type { WindReading } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const START_UTC_MS = Date.parse("2026-01-05T06:00:00.000Z"); // Monday, 14:00 SGT.
const MONTH_DAYS = 30;
const GOLDEN_FLOOR = 12;

const ALIGNMENT_DAYS = new Set([1, 4, 8, 11, 15, 18, 22, 25, 29]);

function wind(directionDeg: number, speedMps: number, now: Date): WindReading {
  return {
    directionDeg: normalizeDeg(directionDeg),
    speedMps,
    timestamp: now.toISOString(),
    source: "nea",
    stationId: "S-plausibility-fixture",
  };
}

function simulateOneMonth(plan: PlanGeometry): number[] {
  const corridor = computeCrossVentCorridor(plan);
  assert.ok(corridor, `${plan.templateId} must expose a cross-vent corridor`);

  let lastNotifiedAtIso: string | null = null;
  const recentNotificationsIso: string[] = [];
  const weeklyNotifications = [0, 0, 0, 0, 0];

  for (let day = 0; day < MONTH_DAYS; day += 1) {
    const now = new Date(START_UTC_MS + day * DAY_MS);
    const aligned = ALIGNMENT_DAYS.has(day);
    const reading = aligned
      ? wind(corridor.azimuthDeg + alignmentOffsetForDay(day), 2.0, now)
      : wind(corridor.azimuthDeg + 90, 2.0, now);

    const result = evaluateResonance({
      plan,
      floor: GOLDEN_FLOOR,
      lastNotifiedAtIso,
      recentNotificationsIso,
      now,
      wind: reading,
      tier: "standard",
      optInAtIso: "2025-12-01T00:00:00.000Z",
    });

    if (result.shouldNotify) {
      const notifiedAtIso = now.toISOString();
      lastNotifiedAtIso = notifiedAtIso;
      recentNotificationsIso.push(notifiedAtIso);
      weeklyNotifications[Math.floor(day / 7)] += 1;
    }
  }

  return weeklyNotifications;
}

function alignmentOffsetForDay(day: number): number {
  return day % 2 === 0 ? -5 : 5;
}

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

describe("Resonance one-month plausibility fixture", () => {
  it("keeps Standard tier notifications inside 1x/week to 4x/week for every Phase 1 template", () => {
    const templateIds = listGeometrySummaries().map((summary) => summary.templateId);

    for (const templateId of templateIds) {
      const weeklyNotifications = simulateOneMonth(getPlanGeometry(templateId));

      for (const [week, count] of weeklyNotifications.entries()) {
        assert.ok(
          count >= 1 && count <= 4,
          `${templateId} week ${week + 1} fired ${count} times; expected 1..4`,
        );
      }
    }
  });
});
