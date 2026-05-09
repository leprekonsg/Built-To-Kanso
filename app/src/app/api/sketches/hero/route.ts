// Empty Room hero rotation route. Telemetry headers:
//   X-Evidence-Tier   "prototype_visualisation".
//   X-Prompt-Id       always "empty-room-hero".
//   X-From-Cache      "prebake" | "true" | "false" on PNG responses.
//
// The hero is the first impression of the app. Its degradation rules are
// stricter than the other sketches: we never surface 5xx. If the prebaked
// asset is missing AND the OpenAI generation cannot complete, we serve the
// most-recent prebaked rotation that does exist, or fall through to a quiet
// JSON 200 explaining the state. The UI is expected to render a Bone-tone
// solid background in that case.
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { NextResponse } from "next/server";
import {
  HERO_ROTATION_COUNT,
  generateEmptyRoomHero,
  type HeroRotationIndex,
} from "@/server/openai/sketches";

const PUBLIC_HERO_DIR = resolve(process.cwd(), "public", "hero");

function bakedHeroPath(rotation: HeroRotationIndex): string {
  return join(PUBLIC_HERO_DIR, `empty-room-${rotation}.png`);
}

async function readBaked(rotation: HeroRotationIndex): Promise<Buffer | null> {
  try {
    return await readFile(bakedHeroPath(rotation));
  } catch {
    return null;
  }
}

function parseRotation(value: string | null): HeroRotationIndex | null {
  if (value === null) return null;
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n) || n < 0 || n >= HERO_ROTATION_COUNT) return null;
  return n as HeroRotationIndex;
}

function bakedPngResponse(buf: Buffer): NextResponse {
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Evidence-Tier": "prototype_visualisation",
      "X-Prompt-Id": "empty-room-hero",
      "X-From-Cache": "prebake",
    },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rotation = parseRotation(url.searchParams.get("rotation"));
  if (rotation === null) {
    return NextResponse.json(
      {
        error: "rotation_out_of_range",
        message: `rotation must be an integer in [0, ${HERO_ROTATION_COUNT - 1}].`,
      },
      { status: 400 },
    );
  }

  const baked = await readBaked(rotation);
  if (baked) return bakedPngResponse(baked);

  const result = await generateEmptyRoomHero(rotation);

  if (result.ok) {
    return new NextResponse(new Uint8Array(result.png), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
        "X-Evidence-Tier": result.tier,
        "X-Prompt-Id": result.promptId,
        "X-From-Cache": String(result.fromCache),
      },
    });
  }

  // Calm refusal: if the requested rotation is not baked and OpenAI cannot
  // materialize it, try a sibling rotation that is baked. The hero is purely
  // decorative; rotation drift is acceptable.
  for (let i = 0; i < HERO_ROTATION_COUNT; i += 1) {
    if (i === rotation) continue;
    const sibling = await readBaked(i as HeroRotationIndex);
    if (sibling) {
      return new NextResponse(new Uint8Array(sibling), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=300",
          "X-Evidence-Tier": "prototype_visualisation",
          "X-Prompt-Id": "empty-room-hero",
          "X-From-Cache": "prebake-sibling",
          "X-Sketch-Fallback": fallbackKindFor(result.reason),
        },
      });
    }
  }

  return NextResponse.json(
    {
      fallback: true,
      reason: result.reason,
      nextAction: result.reason === "no_cached_no_key"
        ? "Run npm run prebake:hero with OPENAI_API_KEY set, or render a Bone-tone surface in the UI."
        : "OpenAI did not return an image. Render a Bone-tone surface in the UI.",
      tier: "prototype_visualisation",
      promptId: result.promptId,
    },
    {
      status: 200,
      headers: {
        "X-Sketch-Fallback": fallbackKindFor(result.reason),
        "X-Prompt-Id": result.promptId,
      },
    },
  );
}

function fallbackKindFor(reason: string): string {
  if (reason === "openai_timeout") return "openai-timeout";
  if (reason === "openai_unreachable") return "openai-unreachable";
  if (reason === "openai_error") return "openai-error";
  return "deterministic-svg";
}
