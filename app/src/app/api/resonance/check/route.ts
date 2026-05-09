import { NextResponse } from "next/server";
import type { PlanGeometry } from "@/server/geometry/types";
import { computeCrossVentCorridor } from "@/server/resonance/corridor";
import { fetchCurrentWind } from "@/server/resonance/nea";
import {
  evaluateResonance,
  STANDARD_RESONANCE_THRESHOLDS,
} from "@/server/resonance/resonance";
import {
  dispatchResonancePushPlaceholder,
  getPushDispatchStatus,
} from "@/server/resonance/subscriptions";

interface ResonanceCheckBody {
  plan?: PlanGeometry;
  floor?: number;
  lastNotifiedAtIso?: string | null;
  recentNotificationsIso?: string[];
  predictedIndoorSpeedMps?: number;
}

export async function GET() {
  return NextResponse.json({
    ready: true,
    status: "ready",
    windSource: process.env.NEA_API_KEY ? "nea" : "mock",
    vapidPublicKeyConfigured: Boolean(process.env.VAPID_PUBLIC_KEY),
    thresholds: STANDARD_RESONANCE_THRESHOLDS,
    cacheTtlSeconds: 60,
    pushDispatch: getPushDispatchStatus(),
  });
}

export async function POST(request: Request) {
  let body: ResonanceCheckBody;
  try {
    body = (await request.json()) as ResonanceCheckBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!body.plan || typeof body.plan !== "object") {
    return NextResponse.json({ error: "plan (PlanGeometry) is required." }, { status: 400 });
  }

  if (typeof body.floor !== "number" || !Number.isFinite(body.floor) || body.floor < 1) {
    return NextResponse.json({ error: "floor is required and must be 1 or higher." }, { status: 400 });
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

  // Fetch wind in parallel with corridor compute. Corridor is sync — we wrap
  // it so Promise.all lets fetchCurrentWind dominate the wall clock.
  const [wind, corridor] = await Promise.all([
    fetchCurrentWind(),
    Promise.resolve(computeCrossVentCorridor(body.plan)),
  ]);

  const evaluation = evaluateResonance({
    plan: body.plan,
    floor: body.floor,
    lastNotifiedAtIso: body.lastNotifiedAtIso ?? null,
    recentNotificationsIso: Array.isArray(body.recentNotificationsIso)
      ? body.recentNotificationsIso
      : [],
    now: new Date(),
    wind,
    predictedIndoorSpeedMps: body.predictedIndoorSpeedMps,
  });
  const pushDispatch = evaluation.shouldNotify ? dispatchResonancePushPlaceholder() : null;

  return NextResponse.json({
    evaluation,
    corridor,
    wind,
    message: evaluation.shouldNotify ? "Your home is breathing right now." : null,
    pushDispatch,
  });
}
