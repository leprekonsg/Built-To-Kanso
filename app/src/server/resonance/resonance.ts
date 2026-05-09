import { createHash } from "node:crypto";
import type { PlanGeometry } from "@/server/geometry/types";
import { computeCrossVentCorridor } from "./corridor";
import { floorToTier, tierMaxNotificationsPerWindow } from "./floorTier";
import {
  isSleepSuppressed,
  isSleepSuppressedFor,
  nextWakeAfter,
  nextWakeAfterFor,
} from "./sleepSuppress";
import type { SleepWindowSettings } from "./subscriptions";
import type { FrequencyTier, ResonanceEvaluation, WindReading } from "./types";

// Brief Phase 1 §23 + 14.5 — Resonance Hours.
// Three-tier frequency control. Comfort floor (0.25 m/s indoor) is shared so
// that "Active" never overrides the calibrated honesty cap.
export interface ResonanceThresholds {
  alignmentToleranceDeg: number;
  minOutdoorSpeedMps: number;
  maxPredictedIndoorSpeedMps: number;
  cooldownHours: number;
}

export const RESONANCE_THRESHOLDS_BY_TIER: Record<FrequencyTier, ResonanceThresholds> = {
  calm: {
    alignmentToleranceDeg: 10,
    minOutdoorSpeedMps: 1.9,
    maxPredictedIndoorSpeedMps: 0.25,
    cooldownHours: 12,
  },
  standard: {
    alignmentToleranceDeg: 15,
    minOutdoorSpeedMps: 1.6,
    maxPredictedIndoorSpeedMps: 0.25,
    cooldownHours: 6,
  },
  active: {
    alignmentToleranceDeg: 22,
    minOutdoorSpeedMps: 1.3,
    maxPredictedIndoorSpeedMps: 0.25,
    cooldownHours: 3,
  },
};

// Back-compat re-export — Standard tier was the only one before 14.5.
export const STANDARD_RESONANCE_THRESHOLDS = RESONANCE_THRESHOLDS_BY_TIER.standard;

export const OPT_IN_GRACE_HOURS = 24;

interface EvaluateResonanceInput {
  plan: PlanGeometry;
  floor: number;
  lastNotifiedAtIso: string | null;
  recentNotificationsIso: string[];
  now: Date;
  wind: WindReading;
  predictedIndoorSpeedMps?: number;
  tier?: FrequencyTier;
  sleepWindow?: SleepWindowSettings;
  optInAtIso?: string | null;
}

export function evaluateResonance(input: EvaluateResonanceInput): ResonanceEvaluation {
  const tier: FrequencyTier = input.tier ?? "standard";
  const thresholds = RESONANCE_THRESHOLDS_BY_TIER[tier];

  const corridor = computeCrossVentCorridor(input.plan);

  if (!corridor) {
    return {
      resonating: false,
      shouldNotify: false,
      reason: "no_cross_vent_corridor",
      nextEligibleAt: null,
      tier: "weather_context",
      alignmentEventId: null,
    };
  }

  const aligned =
    angularDiffDeg(input.wind.directionDeg, corridor.azimuthDeg) <= thresholds.alignmentToleranceDeg;
  const strongEnough = input.wind.speedMps >= thresholds.minOutdoorSpeedMps;
  const predictedIndoorSpeedMps =
    input.predictedIndoorSpeedMps ?? estimatePredictedIndoorSpeedMps(input.wind.speedMps);
  const indoorComfortable = predictedIndoorSpeedMps <= thresholds.maxPredictedIndoorSpeedMps;
  const resonating = aligned && strongEnough && indoorComfortable;

  // Stable id for the current alignment event. Two polls 60s apart that see the
  // same corridor + same wind-direction bucket + same hour bucket return the
  // same id; once the wind drifts >10deg or the hour bucket rolls over, the id
  // changes, which means the in-app banner treats it as a new "your home is
  // breathing" moment. The cooldown logic below prevents real over-firing; this
  // id is the dedup key for the in-app banner only.
  const alignmentEventId = resonating
    ? computeAlignmentEventId(corridor.azimuthDeg, input.wind.directionDeg, input.now)
    : null;

  const floorTier = floorToTier(input.floor);

  // Ground floors get the calibrated honesty path: resonance may still happen,
  // but we never ping. (Brief: "that's not a bug, that's your floor.")
  if (floorTier === "ground") {
    return {
      resonating,
      shouldNotify: false,
      reason: "ground_floor_silent",
      nextEligibleAt: null,
      tier: "weather_context",
      alignmentEventId,
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
      alignmentEventId: null,
    };
  }

  // 24h opt-in grace (brief 14.5). If a user just opted in we hold off on the
  // first ping so the first notification doesn't land before they understand
  // what they signed up for.
  if (input.optInAtIso) {
    const optInMs = Date.parse(input.optInAtIso);
    if (Number.isFinite(optInMs)) {
      const graceUntilMs = optInMs + OPT_IN_GRACE_HOURS * 60 * 60 * 1000;
      if (input.now.getTime() < graceUntilMs) {
        return {
          resonating: true,
          shouldNotify: false,
          reason: "opt_in_grace",
          nextEligibleAt: new Date(graceUntilMs).toISOString(),
          tier: "weather_context",
          alignmentEventId,
        };
      }
    }
  }

  const inSleepWindow = input.sleepWindow
    ? isSleepSuppressedFor(input.now, input.sleepWindow)
    : isSleepSuppressed(input.now);
  if (inSleepWindow) {
    const wakeAt = input.sleepWindow
      ? nextWakeAfterFor(input.now, input.sleepWindow)
      : nextWakeAfter(input.now);
    return {
      resonating: true,
      shouldNotify: false,
      reason: "sleep_suppressed",
      nextEligibleAt: wakeAt.toISOString(),
      tier: "weather_context",
      alignmentEventId,
    };
  }

  const cooldownMs = thresholds.cooldownHours * 60 * 60 * 1000;
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
      alignmentEventId,
    };
  }

  const cap = tierMaxNotificationsPerWindow(floorTier);
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
        alignmentEventId,
      };
    }
  }

  return {
    resonating: true,
    shouldNotify: true,
    reason: "resonating",
    nextEligibleAt: null,
    tier: "weather_context",
    alignmentEventId,
  };
}

// Brief 14.5 dedup: bucket corridor azimuth and wind direction to 10deg, and
// time to a 1h epoch bucket. Two consecutive 60s polls during a stable
// alignment share the bucket. If wind drifts >10deg, id changes (new event);
// if the hour bucket rolls over, id changes (rare boundary case the cooldown
// already covers). 16 hex chars is plenty of entropy at our scale.
const ALIGNMENT_DIR_BUCKET_DEG = 10;
const ALIGNMENT_TIME_BUCKET_MS = 60 * 60 * 1000;

export function computeAlignmentEventId(
  corridorAzimuthDeg: number,
  windDirectionDeg: number,
  now: Date,
): string {
  const azimuthBucket = Math.round(normalizeDeg(corridorAzimuthDeg) / ALIGNMENT_DIR_BUCKET_DEG);
  const directionBucket = Math.round(normalizeDeg(windDirectionDeg) / ALIGNMENT_DIR_BUCKET_DEG);
  const timeBucket = Math.floor(now.getTime() / ALIGNMENT_TIME_BUCKET_MS);
  return createHash("sha256")
    .update(`${azimuthBucket}|${directionBucket}|${timeBucket}`)
    .digest("hex")
    .slice(0, 16);
}

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
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
