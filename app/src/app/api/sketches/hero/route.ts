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

  // async-parallel: prebaked file lookup and (later) sketch generation are
  // not dependent — we resolve the prebaked file first because it is the
  // strong-cache path.
  const baked = await readBaked(rotation);
  if (baked) {
    return new NextResponse(new Uint8Array(baked), {
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

  const result = await generateEmptyRoomHero(rotation);

  if (!result.ok) {
    if (result.reason === "no_cached_no_key") {
      return NextResponse.json(
        {
          error: "hero_unbaked",
          message: "Run the prebake script with OPENAI_API_KEY set.",
          tier: "prototype_visualisation",
          promptId: result.promptId,
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      {
        error: result.reason,
        message: result.detail ?? "OpenAI image call did not return an image.",
        tier: "prototype_visualisation",
        promptId: result.promptId,
      },
      { status: 502 },
    );
  }

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
