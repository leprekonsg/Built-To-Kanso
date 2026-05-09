import type { PlanGeometry } from "@/server/geometry/types";
import { computeCrossVentCorridor } from "./corridor";
import { floorToTier, tierMaxNotificationsPerWindow } from "./floorTier";
import { isSleepSuppressed, nextWakeAfter } from "./sleepSuppress";
import type { ResonanceEvaluation, WindReading } from "./types";

// brief Phase 1 §23 — Resonance Hours Standard tier.
// Resonance condition: |angularDiff(wind.dir, corridor.azimuth)| <= 15° AND
// wind.speed >= 1.6 m/s AND predicted indoor speed <= 0.25 m/s.

export const STANDARD_RESONANCE_THRESHOLDS = {
  alignmentToleranceDeg: 15,
  minOutdoorSpeedMps: 1.6,
  maxPredictedIndoorSpeedMps: 0.25,
  cooldownHours: 6,
} as const;

interface EvaluateResonanceInput {
  plan: PlanGeometry;
  floor: number;
  lastNotifiedAtIso: string | null;
  recentNotificationsIso: string[];
  now: Date;
  wind: WindReading;
  predictedIndoorSpeedMps?: number;
}

export function evaluateResonance(input: EvaluateResonanceInput): ResonanceEvaluation {
  const corridor = computeCrossVentCorridor(input.plan);

  if (!corridor) {
    return {
      resonating: false,
      shouldNotify: false,
      reason: "no_cross_vent_corridor",
      nextEligibleAt: null,
      tier: "weather_context",
    };
  }

  const aligned =
    angularDiffDeg(input.wind.directionDeg, corridor.azimuthDeg) <=
    STANDARD_RESONANCE_THRESHOLDS.alignmentToleranceDeg;
  const strongEnough = input.wind.speedMps >= STANDARD_RESONANCE_THRESHOLDS.minOutdoorSpeedMps;
  const predictedIndoorSpeedMps =
    input.predictedIndoorSpeedMps ?? estimatePredictedIndoorSpeedMps(input.wind.speedMps);
  const indoorComfortable =
    predictedIndoorSpeedMps <= STANDARD_RESONANCE_THRESHOLDS.maxPredictedIndoorSpeedMps;
  const resonating = aligned && strongEnough && indoorComfortable;

  const tier = floorToTier(input.floor);

  // Ground floors get the calibrated honesty path: resonance may still happen,
  // but we never ping. (Brief: "that's not a bug, that's your floor.")
  if (tier === "ground") {
    return {
      resonating,
      shouldNotify: false,
      reason: "ground_floor_silent",
      nextEligibleAt: null,
      tier: "weather_context",
    };
  }

  if (!resonating) {
    return {
      resonating: false,
      shouldNotify: false,
      reason: !aligned
        ? "wind_not_aligned"
        : !strongEnough
          ? "wind_too_calm"
          : "indoor_draft_too_strong",
      nextEligibleAt: null,
      tier: "weather_context",
    };
  }

  if (isSleepSuppressed(input.now)) {
    return {
      resonating: true,
      shouldNotify: false,
      reason: "sleep_suppressed",
      nextEligibleAt: nextWakeAfter(input.now).toISOString(),
      tier: "weather_context",
    };
  }

  const cooldownMs = STANDARD_RESONANCE_THRESHOLDS.cooldownHours * 60 * 60 * 1000;
  const mostRecentNotificationMs = mostRecentPastNotificationMs(input, input.now.getTime());
  if (
    mostRecentNotificationMs !== null &&
    input.now.getTime() - mostRecentNotificationMs < cooldownMs
  ) {
    return {
      resonating: true,
      shouldNotify: false,
      reason: "cooldown_active",
      nextEligibleAt: new Date(mostRecentNotificationMs + cooldownMs).toISOString(),
      tier: "weather_context",
    };
  }

  const cap = tierMaxNotificationsPerWindow(tier);
  if (cap) {
    const windowMs = cap.windowDays * 24 * 60 * 60 * 1000;
    const cutoff = input.now.getTime() - windowMs;
    const within = input.recentNotificationsIso
      .map((iso) => Date.parse(iso))
      .filter((ms) => Number.isFinite(ms) && ms >= cutoff)
      .sort((a, b) => a - b);

    if (within.length >= cap.count) {
      const oldest = within[0];
      return {
        resonating: true,
        shouldNotify: false,
        reason: "cooldown_active",
        nextEligibleAt: new Date(oldest + windowMs).toISOString(),
        tier: "weather_context",
      };
    }
  }

  return {
    resonating: true,
    shouldNotify: true,
    reason: "resonating",
    nextEligibleAt: null,
    tier: "weather_context",
  };
}

// Smallest unsigned angular distance between two compass headings (degrees).
function angularDiffDeg(a: number, b: number): number {
  const diff = Math.abs(((a - b + 540) % 360) - 180);
  return diff;
}

function estimatePredictedIndoorSpeedMps(outdoorSpeedMps: number): number {
  return Number((outdoorSpeedMps * 0.1).toFixed(3));
}

function mostRecentPastNotificationMs(input: EvaluateResonanceInput, nowMs: number): number | null {
  const candidates = [
    input.lastNotifiedAtIso,
    ...input.recentNotificationsIso,
  ]
    .filter((iso): iso is string => typeof iso === "string")
    .map((iso) => Date.parse(iso))
    .filter((ms) => Number.isFinite(ms) && ms <= nowMs);

  return candidates.length > 0 ? Math.max(...candidates) : null;
}
