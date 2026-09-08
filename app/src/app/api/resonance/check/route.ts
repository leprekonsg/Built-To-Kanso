import { NextResponse } from "next/server";
import { submittedGeometryCapabilityResponse } from "@/server/geometry/releaseResponse";
import type { PlanGeometry } from "@/server/geometry/types";
import { computeCrossVentCorridor } from "@/server/resonance/corridor";
import { defaultFrequencyTierForFloor, floorToTier } from "@/server/resonance/floorTier";
import { fetchCurrentWind } from "@/server/resonance/nea";
import {
  evaluateResonance,
  RESONANCE_THRESHOLDS_BY_TIER,
  STANDARD_RESONANCE_THRESHOLDS,
} from "@/server/resonance/resonance";
import { getDefaultPushSenderStatus } from "@/server/resonance/dispatch";
import { count, countByTier, get } from "@/server/resonance/subscriptions";
import type { FloorTier, FrequencyTier, ResonanceEvaluation } from "@/server/resonance/types";

interface ResonanceCheckBody {
  plan?: PlanGeometry;
  floor?: number;
  siteLocation?: SiteLocation;
  lastNotifiedAtIso?: string | null;
  recentNotificationsIso?: string[];
  predictedIndoorSpeedMps?: number;
  userId?: string;
  frequencyTier?: FrequencyTier;
}

interface SiteLocation {
  latitude: number;
  longitude: number;
}

// Brief 14.5 — banner shape for the in-app Resonance surface. VAPID/web-push
// is out of Phase 1; the relationship loop now lives in-app via this payload
// + a 60s client poll. The banner client uses alignmentEventId as the dedup
// key (see ResonanceBanner).
type BannerKind = "alignment" | "quiet_floor" | "silent";

interface ResonanceBanner {
  kind: BannerKind;
  title: string;
  body: string;
  // Only populated for kind: "alignment". Stable across consecutive polls of
  // the same alignment event so the client shows the message once.
  alignmentEventId: string | null;
  // Floor-tier label for the calm "your floor is quieter" microcopy.
  floorTier: FloorTier;
  floorMessage: string;
}

const FREQUENCY_TIERS: ReadonlySet<FrequencyTier> = new Set(["calm", "standard", "active"]);

const FLOOR_TIER_MESSAGES: Record<FloorTier, string> = {
  ground:
    "Your floor is quieter, that's not a bug. Wind reaches low floors less often, so Resonance Hours stay rare here.",
  transition:
    "Mid-low band. Cross-ventilation drifts in and out depending on the neighbouring blocks.",
  golden: "Golden Floors range. Optimal natural ventilation here.",
  turbulent:
    "High floor. Wind is stronger but turbulent, so the studio listens at the Calm tier by default.",
};

export async function GET() {
  const pushDispatch = await getDefaultPushSenderStatus();

  return NextResponse.json({
    ready: pushDispatch.available,
    status: pushDispatch.available ? "ready" : "not_ready",
    windSource: process.env.NEA_API_KEY ? "nea" : "mock",
    vapidPublicKeyConfigured: Boolean(process.env.VAPID_PUBLIC_KEY),
    thresholds: STANDARD_RESONANCE_THRESHOLDS,
    thresholdsByTier: RESONANCE_THRESHOLDS_BY_TIER,
    cacheTtlSeconds: 60,
    subscriptionCount: count({ status: "active" }),
    subscriptionCountByTier: countByTier(),
    pushDispatch,
  });
}

export async function POST(request: Request) {
  let body: ResonanceCheckBody;
  try {
    body = (await request.json()) as ResonanceCheckBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!body?.plan || typeof body.plan !== "object") {
    return NextResponse.json({ error: "plan (PlanGeometry) is required." }, { status: 400 });
  }

  if (typeof body.floor !== "number" || !Number.isFinite(body.floor) || body.floor < 1) {
    return NextResponse.json({ error: "floor is required and must be 1 or higher." }, { status: 400 });
  }

  if (body.siteLocation !== undefined && !isSiteLocation(body.siteLocation)) {
    return NextResponse.json(
      { error: "siteLocation must include numeric latitude and longitude when provided." },
      { status: 400 },
    );
  }

  if (
    body.predictedIndoorSpeedMps !== undefined &&
    (typeof body.predictedIndoorSpeedMps !== "number" ||
      !Number.isFinite(body.predictedIndoorSpeedMps) ||
      body.predictedIndoorSpeedMps < 0)
  ) {
    return NextResponse.json(
      { error: "predictedIndoorSpeedMps must be a non-negative number when provided." },
      { status: 400 },
    );
  }

  if (body.frequencyTier !== undefined && !FREQUENCY_TIERS.has(body.frequencyTier)) {
    return NextResponse.json(
      { error: "frequencyTier must be one of calm, standard, active." },
      { status: 400 },
    );
  }

  const blocked = submittedGeometryCapabilityResponse(body.plan, "homeWeatherAlignment");
  if (blocked) return blocked;
  const floor = body.floor;
  const tierFromBody: FrequencyTier = body.frequencyTier ?? defaultFrequencyTierForFloor(floor);

  // Fetch wind in parallel with corridor compute. Corridor is sync — we wrap
  // it so Promise.all lets fetchCurrentWind dominate the wall clock.
  const [wind, corridor] = await Promise.all([
    fetchCurrentWind({ siteLocation: body.siteLocation }),
    Promise.resolve(computeCrossVentCorridor(body.plan)),
  ]);

  // Diagnostic only. This route must never send push notifications; VAPID/web-
  // push is out of Phase 1, and /api/resonance/dispatch is the explicit sender.
  if (typeof body.userId === "string" && body.userId.length > 0) {
    const subscription = get(body.userId);
    if (!subscription) {
      return NextResponse.json({ error: "userId not found." }, { status: 404 });
    }
    const evaluation = evaluateResonance({
      plan: body.plan,
      floor,
      lastNotifiedAtIso: subscription.lastNotifiedAtIso,
      recentNotificationsIso: subscription.recentNotificationsIso,
      now: new Date(),
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
      evaluation,
      corridor,
      wind,
      message: evaluation.shouldNotify ? "Outdoor wind aligns with the illustrated path. Indoor airflow is not measured." : null,
      banner: buildBanner(evaluation, floor),
      pushDispatch: null,
      userId: subscription.userId,
      frequencyTier: subscription.frequencyTier,
    });
  }

  // Anonymous path: still evaluate locally so the in-app banner has a fresh
  // alignmentEventId to dedup on. dispatchScheduledResonancePush only handles
  // VAPID push (out of Phase 1) and registered subscribers; without a userId
  // we don't want push dispatch behaviour to mask the banner evaluation.
  const evaluation = evaluateResonance({
    plan: body.plan,
    floor,
    lastNotifiedAtIso: body.lastNotifiedAtIso ?? null,
    recentNotificationsIso: Array.isArray(body.recentNotificationsIso)
      ? body.recentNotificationsIso
      : [],
    now: new Date(),
    wind,
    predictedIndoorSpeedMps: body.predictedIndoorSpeedMps,
    tier: tierFromBody,
  });

  return NextResponse.json({
    evaluation,
    corridor,
    wind,
    message: evaluation.shouldNotify ? "Outdoor wind aligns with the illustrated path. Indoor airflow is not measured." : null,
    banner: buildBanner(evaluation, floor),
    pushDispatch: null,
  });
}

function buildBanner(evaluation: ResonanceEvaluation, floor: number): ResonanceBanner {
  const tier = floorToTier(floor);
  const floorMessage = FLOOR_TIER_MESSAGES[tier];

  if (evaluation.shouldNotify) {
    return {
      kind: "alignment",
      title: "Outdoor wind aligns with the illustrated path. Indoor airflow is not measured.",
      body: "The selected outdoor station aligns with this assumed plan direction. Check local rain, access and actual openings before changing window use.",
      alignmentEventId: evaluation.alignmentEventId,
      floorTier: tier,
      floorMessage,
    };
  }

  if (tier === "ground") {
    return {
      kind: "quiet_floor",
      title: "Your floor is quieter.",
      body: floorMessage,
      alignmentEventId: null,
      floorTier: tier,
      floorMessage,
    };
  }

  return {
    kind: "silent",
    title: "Listening for wind.",
    body: "Resonance Hours stay quiet between alignment events.",
    alignmentEventId: null,
    floorTier: tier,
    floorMessage,
  };
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
