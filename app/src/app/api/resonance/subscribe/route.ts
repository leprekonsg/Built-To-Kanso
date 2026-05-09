import { NextResponse } from "next/server";
import {
  get,
  getByEndpoint,
  register,
  unregister,
  unregisterByEndpoint,
  updateSettings,
  type UserSubscription,
} from "@/server/resonance/subscriptions";
import type { FrequencyTier } from "@/server/resonance/types";

const FREQUENCY_TIERS: ReadonlySet<FrequencyTier> = new Set(["calm", "standard", "active"]);

interface SubscribePostBody {
  endpoint?: string;
  expirationTime?: number | null;
  keys?: { p256dh: string; auth: string };
  userId?: string;
  frequencyTier?: FrequencyTier;
  sleepStartHourSgt?: number;
  sleepStartMinuteSgt?: number;
  sleepEndHourSgt?: number;
  sleepEndMinuteSgt?: number;
}

interface SubscribeDeleteBody {
  userId?: string;
  endpoint?: string;
}

interface SubscribePatchBody {
  userId?: string;
  frequencyTier?: FrequencyTier;
  sleepStartHourSgt?: number;
  sleepStartMinuteSgt?: number;
  sleepEndHourSgt?: number;
  sleepEndMinuteSgt?: number;
}

export async function POST(request: Request) {
  let body: SubscribePostBody;
  try {
    body = (await request.json()) as SubscribePostBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!body || typeof body.endpoint !== "string" || body.endpoint.length === 0) {
    return NextResponse.json(
      { error: "PushSubscription requires a non-empty endpoint." },
      { status: 400 },
    );
  }

  if (body.frequencyTier !== undefined && !FREQUENCY_TIERS.has(body.frequencyTier)) {
    return NextResponse.json(
      { error: "frequencyTier must be one of calm, standard, active." },
      { status: 400 },
    );
  }

  const sleepError = validateOptionalSleepFields(body);
  if (sleepError) return NextResponse.json({ error: sleepError }, { status: 400 });

  let record: UserSubscription;
  try {
    record = register({
      endpoint: body.endpoint,
      expirationTime: body.expirationTime ?? null,
      keys: body.keys,
      userId: body.userId,
      frequencyTier: body.frequencyTier,
      sleepStartHourSgt: body.sleepStartHourSgt,
      sleepStartMinuteSgt: body.sleepStartMinuteSgt,
      sleepEndHourSgt: body.sleepEndHourSgt,
      sleepEndMinuteSgt: body.sleepEndMinuteSgt,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to register subscription." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    userId: record.userId,
    frequencyTier: record.frequencyTier,
    sleep: sleepShape(record),
    optInAtIso: record.optInAtIso,
  });
}

export async function DELETE(request: Request) {
  let body: SubscribeDeleteBody = {};
  try {
    const text = await request.text();
    if (text.length > 0) body = JSON.parse(text) as SubscribeDeleteBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON when provided." }, { status: 400 });
  }

  const url = new URL(request.url);
  const userIdQuery = url.searchParams.get("userId");
  const endpointQuery = url.searchParams.get("endpoint");

  const userId = body.userId ?? userIdQuery ?? null;
  const endpoint = body.endpoint ?? endpointQuery ?? null;

  if (!userId && !endpoint) {
    return NextResponse.json(
      { error: "Provide userId or endpoint to unsubscribe." },
      { status: 400 },
    );
  }

  let removed = false;
  if (userId) removed = unregister(userId) || removed;
  if (!removed && endpoint) removed = unregisterByEndpoint(endpoint) || removed;

  return NextResponse.json({ ok: true, removed });
}

export async function PATCH(request: Request) {
  let body: SubscribePatchBody;
  try {
    body = (await request.json()) as SubscribePatchBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId : null;
  if (!userId) {
    return NextResponse.json({ error: "userId is required to update settings." }, { status: 400 });
  }

  if (body.frequencyTier !== undefined && !FREQUENCY_TIERS.has(body.frequencyTier)) {
    return NextResponse.json(
      { error: "frequencyTier must be one of calm, standard, active." },
      { status: 400 },
    );
  }

  const sleepError = validateOptionalSleepFields(body);
  if (sleepError) return NextResponse.json({ error: sleepError }, { status: 400 });

  if (!get(userId) && !getByEndpoint(userId)) {
    return NextResponse.json({ error: "userId not found." }, { status: 404 });
  }

  let record: UserSubscription | null;
  try {
    record = updateSettings(userId, {
      frequencyTier: body.frequencyTier,
      sleepStartHourSgt: body.sleepStartHourSgt,
      sleepStartMinuteSgt: body.sleepStartMinuteSgt,
      sleepEndHourSgt: body.sleepEndHourSgt,
      sleepEndMinuteSgt: body.sleepEndMinuteSgt,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update settings." },
      { status: 400 },
    );
  }

  if (!record) {
    return NextResponse.json({ error: "userId not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    userId: record.userId,
    frequencyTier: record.frequencyTier,
    sleep: sleepShape(record),
  });
}

function validateOptionalSleepFields(body: {
  sleepStartHourSgt?: number;
  sleepStartMinuteSgt?: number;
  sleepEndHourSgt?: number;
  sleepEndMinuteSgt?: number;
}): string | null {
  for (const [name, value] of [
    ["sleepStartHourSgt", body.sleepStartHourSgt] as const,
    ["sleepEndHourSgt", body.sleepEndHourSgt] as const,
  ]) {
    if (value === undefined) continue;
    if (!Number.isInteger(value) || value < 0 || value > 23) {
      return `${name} must be an integer in 0-23.`;
    }
  }
  for (const [name, value] of [
    ["sleepStartMinuteSgt", body.sleepStartMinuteSgt] as const,
    ["sleepEndMinuteSgt", body.sleepEndMinuteSgt] as const,
  ]) {
    if (value === undefined) continue;
    if (!Number.isInteger(value) || value < 0 || value > 59) {
      return `${name} must be an integer in 0-59.`;
    }
  }
  return null;
}

function sleepShape(record: UserSubscription) {
  return {
    sleepStartHourSgt: record.sleepStartHourSgt,
    sleepStartMinuteSgt: record.sleepStartMinuteSgt,
    sleepEndHourSgt: record.sleepEndHourSgt,
    sleepEndMinuteSgt: record.sleepEndMinuteSgt,
  };
}
