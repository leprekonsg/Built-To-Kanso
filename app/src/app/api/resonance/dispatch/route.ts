import { NextResponse } from "next/server";
import { submittedGeometryReleaseResponse } from "@/server/geometry/releaseResponse";
import type { PlanGeometry } from "@/server/geometry/types";
import {
  dispatchScheduledResonancePush,
  getDefaultPushSenderStatus,
} from "@/server/resonance/dispatch";
import { fetchCurrentWind } from "@/server/resonance/nea";
import { count, countByTier, get } from "@/server/resonance/subscriptions";
import {
  evaluateResonance,
  RESONANCE_THRESHOLDS_BY_TIER,
  STANDARD_RESONANCE_THRESHOLDS,
} from "@/server/resonance/resonance";
import type { WindReading } from "@/server/resonance/types";

interface ResonanceDispatchBody {
  plan?: PlanGeometry;
  floor?: number;
  siteLocation?: SiteLocation;
  lastNotifiedAtIso?: string | null;
  recentNotificationsIso?: string[];
  predictedIndoorSpeedMps?: number;
  dryRun?: boolean;
  nowIso?: string;
  wind?: WindReading;
  userId?: string;
}

interface SiteLocation {
  latitude: number;
  longitude: number;
}

export async function GET() {
  const pushDispatch = await getDefaultPushSenderStatus();

  return NextResponse.json({
    ready: pushDispatch.available,
    status: pushDispatch.available ? "ready" : "not_ready",
    thresholds: STANDARD_RESONANCE_THRESHOLDS,
    thresholdsByTier: RESONANCE_THRESHOLDS_BY_TIER,
    subscriptionCount: count({ status: "active" }),
    subscriptionCountByTier: countByTier(),
    pushDispatch,
  });
}

export async function POST(request: Request) {
  let body: ResonanceDispatchBody;
  try {
    body = (await request.json()) as ResonanceDispatchBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const validationError = validateDispatchBody(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  if (!body.dryRun && (body.wind !== undefined || body.nowIso !== undefined)) {
    return NextResponse.json({ error: "Supplied weather and clock values are diagnostic-only. Set dryRun to true; live dispatch uses current server-fetched weather." }, { status: 400 });
  }

  const blocked = submittedGeometryReleaseResponse(body.plan);
  if (blocked) return blocked;
  const wind = body.wind ?? (await fetchCurrentWind({ siteLocation: body.siteLocation }));
  const now = body.nowIso ? new Date(body.nowIso) : body.wind ? new Date(wind.timestamp) : new Date();

  // Single-user diagnostic path: evaluate against the supplied user without
  // ever sending. Mirrors check/route's userId branch for consistency.
  if (typeof body.userId === "string" && body.userId.length > 0) {
    const subscription = get(body.userId);
    if (!subscription) {
      return NextResponse.json({ error: "userId not found." }, { status: 404 });
    }
    const evaluation = evaluateResonance({
      plan: body.plan as PlanGeometry,
      floor: body.floor as number,
      lastNotifiedAtIso: subscription.lastNotifiedAtIso,
      recentNotificationsIso: subscription.recentNotificationsIso,
      now,
      wind,
      predictedIndoorSpeedMps: body.predictedIndoorSpeedMps,
      tier: subscription.frequencyTier,
      sleepWindow: {
        sleepStartHourSgt: subscription.sleepStartHourSgt,
        sleepStartMinuteSgt: subscription.sleepStartMinuteSgt,
        sleepEndHourSgt: subscription.sleepEndHourSgt,
        sleepEndMinuteSgt: subscription.sleepEndMinuteSgt,
      },
      optInAtIso: subscription.optInAtIso,
    });
    return NextResponse.json({
      dispatch: {
        status: "skipped",
        attempted: false,
        subscriptionCount: 1,
        sentCount: 0,
        failedCount: 0,
        prunedCount: 0,
        payload: null,
        evaluation,
      },
      wind,
      userId: subscription.userId,
      frequencyTier: subscription.frequencyTier,
    });
  }

  const dispatch = await dispatchScheduledResonancePush({
    plan: body.plan as PlanGeometry,
    floor: body.floor as number,
    lastNotifiedAtIso: body.lastNotifiedAtIso ?? null,
    recentNotificationsIso: Array.isArray(body.recentNotificationsIso)
      ? body.recentNotificationsIso
      : [],
    now,
    wind,
    predictedIndoorSpeedMps: body.predictedIndoorSpeedMps,
    dryRun: Boolean(body.dryRun),
  });

  return NextResponse.json({ dispatch, wind });
}

function validateDispatchBody(
  body: ResonanceDispatchBody,
): string | null {
  if (!body?.plan || typeof body.plan !== "object") {
    return "plan (PlanGeometry) is required.";
  }

  if (typeof body.floor !== "number" || !Number.isFinite(body.floor) || body.floor < 1) {
    return "floor is required and must be 1 or higher.";
  }

  if (
    body.predictedIndoorSpeedMps !== undefined &&
    (typeof body.predictedIndoorSpeedMps !== "number" ||
      !Number.isFinite(body.predictedIndoorSpeedMps) ||
      body.predictedIndoorSpeedMps < 0)
  ) {
    return "predictedIndoorSpeedMps must be a non-negative number when provided.";
  }

  if (body.siteLocation !== undefined && !isSiteLocation(body.siteLocation)) {
    return "siteLocation must include numeric latitude and longitude when provided.";
  }

  if (body.nowIso !== undefined && Number.isNaN(Date.parse(body.nowIso))) {
    return "nowIso must be an ISO date string when provided.";
  }

  if (body.wind !== undefined && !isWindReading(body.wind)) {
    return "wind must include directionDeg, speedMps, timestamp, and source when provided.";
  }

  return null;
}

function isSiteLocation(value: SiteLocation): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof value.latitude === "number" &&
    Number.isFinite(value.latitude) &&
    typeof value.longitude === "number" &&
    Number.isFinite(value.longitude)
  );
}

function isWindReading(value: WindReading): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof value.directionDeg === "number" &&
    Number.isFinite(value.directionDeg) &&
    typeof value.speedMps === "number" &&
    Number.isFinite(value.speedMps) &&
    typeof value.timestamp === "string" &&
    !Number.isNaN(Date.parse(value.timestamp)) &&
    (value.source === "nea" || value.source === "mock")
  );
}
