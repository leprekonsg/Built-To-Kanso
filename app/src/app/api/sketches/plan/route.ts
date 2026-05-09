import { NextResponse } from "next/server";
import { getPlanGeometry, isTemplateId } from "@/server/geometry/registry";
import {
  renderPlanSketchFallbackSvg,
  sketchFallbackArtifact,
  wantsJson,
} from "@/server/openai/fallbackSvg";

interface PlanSketchRequestBody {
  templateId?: string;
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

  const svg = renderPlanSketchFallbackSvg(getPlanGeometry(body.templateId));
  const fallback = sketchFallbackArtifact("plan", svg);

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
      "X-Sketch-Fallback": "deterministic-svg",
    },
  });
}
