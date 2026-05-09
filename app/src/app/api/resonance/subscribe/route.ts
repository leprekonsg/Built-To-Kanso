import { NextResponse } from "next/server";
import { register, type PushSubscriptionLike } from "@/server/resonance/subscriptions";

export async function POST(request: Request) {
  let body: PushSubscriptionLike;
  try {
    body = (await request.json()) as PushSubscriptionLike;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!body || typeof body.endpoint !== "string" || body.endpoint.length === 0) {
    return NextResponse.json(
      { error: "PushSubscription requires a non-empty endpoint." },
      { status: 400 },
    );
  }

  register(body);
  return NextResponse.json({ ok: true });
}
