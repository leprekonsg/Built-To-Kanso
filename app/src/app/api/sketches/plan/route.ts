// Plan Sketch route. Telemetry headers (see route.test.ts):
//   X-Evidence-Tier      always "prototype_visualisation".
//   X-Prompt-Id          present on PNG and on no-key SVG fall-through.
//   X-From-Cache         "true"|"false" on PNG responses only.
//   X-Sketch-Source      "local-prebaked" on committed public demo assets.
//   X-Plan-Sketch-Cache-Path relative path under public/plan-sketches/.
//   X-Sketch-Fallback    set on every SVG fallback. Values:
//                          "deterministic-svg"        no-key path
//                          "openai-error"             OpenAI returned !ok
//                          "openai-timeout"           AbortController fired
//                          "openai-unreachable"       network failure
//   X-Sketch-Rasterizer  set when the optional rasterizer is unavailable.
//
// As of 2026-05-09 every failure mode lands on a calm 200 + SVG fallback.
// The route never returns 5xx for an OpenAI miss; the UI renders a designed
// surface, not an alarming error toast.
import { NextResponse } from "next/server";
import { getPlanGeometry, isTemplateId } from "@/server/geometry/registry";
import {
  renderPlanSketchFallbackSvg,
  sketchFallbackArtifact,
  wantsJson,
} from "@/server/openai/fallbackSvg";
import { generatePlanSketch } from "@/server/openai/sketches";
import { rasterizeSvgToPng } from "@/server/openai/svgRaster";
import { resolvePlanSketchArtifact, type PlanSketchArtifact } from "@/server/sketches/planSketchAsset";

interface PlanSketchRequestBody {
  templateId?: string;
}

type FallbackKind =
  | "deterministic-svg"
  | "openai-error"
  | "openai-timeout"
  | "openai-unreachable";

function svgFallbackResponse(
  svg: string,
  kind: FallbackKind = "deterministic-svg",
  headers: Record<string, string> = {},
) {
  const fallback = sketchFallbackArtifact("plan", svg);
  return new NextResponse(fallback.svg, {
    status: 200,
    headers: {
      "Content-Type": fallback.contentType,
      "Cache-Control": "private, max-age=300",
      "X-Evidence-Tier": fallback.tier,
      "X-Sketch-Fallback": kind,
      ...headers,
    },
  });
}

function wantsSvg(request: Request): boolean {
  return request.headers.get("accept")?.includes("image/svg+xml") ?? false;
}

function jsonFallbackResponse(
  svg: string,
  overrides?: { reason?: string; nextAction?: string; promptId?: string },
) {
  const fallback = sketchFallbackArtifact("plan", svg);
  return NextResponse.json(
    {
      fallback: fallback.fallback,
      contentType: fallback.contentType,
      reason: overrides?.reason ?? fallback.reason,
      nextAction: overrides?.nextAction ?? fallback.nextAction,
      tier: fallback.tier,
      promptId: overrides?.promptId,
    },
    { status: 200 },
  );
}

function localPngResponse(artifact: PlanSketchArtifact) {
  return new NextResponse(new Uint8Array(artifact.png), {
    status: 200,
    headers: {
      "Content-Type": artifact.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Evidence-Tier": artifact.tier,
      "X-From-Cache": "true",
      "X-Sketch-Source": artifact.source,
      "X-Plan-Sketch-Cache-Path": artifact.cachePath,
    },
  });
}

function localJsonResponse(artifact: PlanSketchArtifact) {
  return NextResponse.json(
    {
      fallback: false,
      contentType: artifact.contentType,
      source: artifact.source,
      cachePath: artifact.cachePath,
      tier: artifact.tier,
      nextAction: "Using local prebaked Plan Sketch asset.",
    },
    { status: 200 },
  );
}

function fallbackKindFor(reason: string): FallbackKind {
  if (reason === "openai_timeout") return "openai-timeout";
  if (reason === "openai_unreachable") return "openai-unreachable";
  if (reason === "openai_error") return "openai-error";
  return "deterministic-svg";
}

function calmFallbackCopy(reason: string): { reason: string; nextAction: string } {
  if (reason === "openai_timeout") {
    return {
      reason: "openai_timeout",
      nextAction: "OpenAI did not respond in time. The deterministic plan is shown; retry in a moment.",
    };
  }
  if (reason === "openai_unreachable") {
    return {
      reason: "openai_unreachable",
      nextAction: "Could not reach OpenAI. The deterministic plan is shown; retry when the network recovers.",
    };
  }
  if (reason === "openai_error") {
    return {
      reason: "openai_error",
      nextAction: "OpenAI declined the request. The deterministic plan is shown; the geometry remains the source of truth.",
    };
  }
  return {
    reason: "png_or_openai_unavailable",
    nextAction: "Set OPENAI_API_KEY to materialize the plan via GPT Image 2, or request image/svg+xml to use the deterministic plan.",
  };
}

export async function POST(request: Request) {
  let body: PlanSketchRequestBody;
  try {
    body = (await request.json()) as PlanSketchRequestBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!body.templateId || !isTemplateId(body.templateId)) {
    return NextResponse.json(
      { error: "templateId must be one of: tampines-greenweave, tengah-5room, resale-exec-1990s." },
      { status: 400 },
    );
  }

  const plan = getPlanGeometry(body.templateId);
  const svg = renderPlanSketchFallbackSvg(plan);
  if (wantsSvg(request)) return svgFallbackResponse(svg);

  const local = await resolvePlanSketchArtifact(body.templateId);
  if (local) {
    if (wantsJson(request)) return localJsonResponse(local);
    return localPngResponse(local);
  }

  if (wantsJson(request)) return jsonFallbackResponse(svg);

  // Rasterize the deterministic plan SVG so GPT Image 2 receives a PNG
  // structural reference (Section 16.1 style transfer). If the optional
  // rasterizer is unavailable, fall back to deterministic SVG.
  const raster = await rasterizeSvgToPng(svg);

  if (raster.ok) {
    const result = await generatePlanSketch(raster.png);

    if (result.ok) {
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

    // Calm refusal: any OpenAI failure (rate limit, 5xx, network, timeout)
    // falls through to a deterministic SVG with telemetry. No 5xx surfaces
    // to the user; the UI gets a designed Black-state render.
    const kind = fallbackKindFor(result.reason);
    const copy = calmFallbackCopy(result.reason);
    if (wantsJson(request)) {
      return jsonFallbackResponse(svg, {
        reason: copy.reason,
        nextAction: copy.nextAction,
        promptId: result.promptId,
      });
    }
    return svgFallbackResponse(svg, kind, { "X-Prompt-Id": result.promptId });
  }

  // Rasterizer unavailable or failed.
  if (wantsJson(request)) {
    return jsonFallbackResponse(svg, {
      reason: "png_or_openai_unavailable",
      nextAction: "Install '@resvg/resvg-js' to enable GPT Image 2 plan rendering, or request image/svg+xml to use the deterministic plan.",
    });
  }
  return svgFallbackResponse(svg, "deterministic-svg", { "X-Sketch-Rasterizer": raster.reason });
}
