import { NextResponse } from "next/server";
import {
  normalizeTokenVisualRequest,
  resolveTokenVisual,
  tokenVisualHealth,
} from "@/server/tokens/visuals";

export function GET() {
  return NextResponse.json(tokenVisualHealth(), {
    status: 200,
    headers: {
      "X-Token-Visual-Only": "true",
    },
  });
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const validation = normalizeTokenVisualRequest(body);
  if (typeof validation === "string") {
    return NextResponse.json({ error: validation }, { status: 400 });
  }

  const result = await resolveTokenVisual(validation);
  return NextResponse.json(result, {
    status: 200,
    headers: {
      "Cache-Control": "private, max-age=60",
      "X-Evidence-Tier": result.tier,
      "X-Token-Visual-Only": "true",
      "X-Token-Visual-Provider": result.provider,
    },
  });
}
