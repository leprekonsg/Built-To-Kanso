import { NextResponse } from "next/server";
import { getPlanGeometry, isTemplateId } from "@/server/geometry/registry";
import {
  renderLifeAnchorFallbackSvg,
  sketchFallbackArtifact,
  wantsJson,
} from "@/server/openai/fallbackSvg";
import { generateLifeSketch } from "@/server/openai/sketches";

interface LifeSketchRequestBody {
  templateId?: string;
  // base64-encoded PNG of the locked Three.js anchor render. The anchor
  // itself is owned by Material System (Agent 4); until that ships we cannot
  // accept arbitrary client renders, so this remains a hard prerequisite.
  anchorPng?: string;
}

export async function POST(request: Request) {
  let body: LifeSketchRequestBody;
  try {
    body = (await request.json()) as LifeSketchRequestBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!body.templateId || !isTemplateId(body.templateId)) {
    return NextResponse.json(
      { error: "templateId must be one of: tampines-greenweave, tengah-5room, resale-exec-1990s." },
      { status: 400 },
    );
  }

  if (!body.anchorPng || typeof body.anchorPng !== "string") {
    const svg = renderLifeAnchorFallbackSvg(getPlanGeometry(body.templateId));
    const fallback = sketchFallbackArtifact("life-anchor", svg);

    if (wantsJson(request)) {
      return NextResponse.json(
        {
          fallback: fallback.fallback,
          contentType: fallback.contentType,
          reason: fallback.reason,
          nextAction: fallback.nextAction,
          tier: fallback.tier,
        },
        { status: 200 },
      );
    }

    return new NextResponse(fallback.svg, {
      status: 200,
      headers: {
        "Content-Type": fallback.contentType,
        "Cache-Control": "private, max-age=300",
        "X-Evidence-Tier": fallback.tier,
        "X-Sketch-Fallback": "deterministic-anchor-svg",
      },
    });
  }

  let anchorBuffer: Buffer;
  try {
    anchorBuffer = Buffer.from(body.anchorPng, "base64");
  } catch {
    return NextResponse.json(
      { error: "anchor_decode_failed", message: "anchorPng must be base64-encoded PNG bytes." },
      { status: 400 },
    );
  }

  const result = await generateLifeSketch(anchorBuffer);

  if (!result.ok) {
    if (result.reason === "no_cached_no_key") {
      const svg = renderLifeAnchorFallbackSvg(getPlanGeometry(body.templateId));
      const fallback = sketchFallbackArtifact("life-anchor", svg);

      if (wantsJson(request)) {
        return NextResponse.json(
          {
            fallback: fallback.fallback,
            contentType: fallback.contentType,
            reason: "png_or_openai_unavailable",
            nextAction: "Set OPENAI_API_KEY for materialization, or request image/svg+xml to use the deterministic anchor.",
            tier: fallback.tier,
            promptId: result.promptId,
          },
          { status: 200 },
        );
      }

      return new NextResponse(fallback.svg, {
        status: 200,
        headers: {
          "Content-Type": fallback.contentType,
          "Cache-Control": "private, max-age=300",
          "X-Evidence-Tier": fallback.tier,
          "X-Prompt-Id": result.promptId,
          "X-Sketch-Fallback": "deterministic-anchor-svg",
        },
      });
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
      "Cache-Control": "private, max-age=300",
      "X-Evidence-Tier": result.tier,
      "X-Prompt-Id": result.promptId,
      "X-From-Cache": String(result.fromCache),
    },
  });
}
