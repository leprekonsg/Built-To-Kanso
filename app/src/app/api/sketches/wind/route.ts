import { NextResponse } from "next/server";
import { geometryReleaseResponse } from "@/server/geometry/releaseResponse";
import { getPlanGeometry } from "@/server/geometry/registry";
import {
  renderWindSketchOverBaseSvg,
  renderWindSketchSvg,
  wantsJson,
} from "@/server/openai/fallbackSvg";
import { resolveWindBaseArtifact } from "@/server/sketches/windBaseAsset";
import { buildTier4Simulation, validateSimulationRequest } from "@/server/simulation/tier4";

interface WindSketchRequestBody {
  templateId?: unknown;
  tokenPlacements?: unknown;
  condition?: unknown;
}

export function isPolishRequested(searchParams: URLSearchParams): boolean {
  return searchParams.get("polish") === "1";
}

export async function POST(request: Request) {
  let body: WindSketchRequestBody;
  try {
    body = (await request.json()) as WindSketchRequestBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const valid = validateSimulationRequest({
    ...body,
    condition: body?.condition ?? "ne_monsoon",
  });
  if (typeof valid === "string") {
    return NextResponse.json({ error: "invalid_wind_sketch_request", message: valid }, { status: 400 });
  }

  const blocked = geometryReleaseResponse(valid.templateId);
  if (blocked) return blocked;
  const plan = getPlanGeometry(valid.templateId);
  const field = buildTier4Simulation(valid);
  // Stage B/C pipeline: prefer the prebaked sumi-e Stage B
  // background when present; otherwise fall back to the procedural-background
  // composite. Either path produces identical streamline geometry because
  // Stage C is deterministic SVG composition.
  const stageB = await resolveWindBaseArtifact(valid.templateId);
  const svg = stageB
    ? renderWindSketchOverBaseSvg(plan, field, stageB.png)
    : renderWindSketchSvg(plan, field);
  const contentType = "image/svg+xml";

  const url = new URL(request.url);
  const polishRequested = isPolishRequested(url.searchParams);

  // The legacy polish flag never sends composed streamlines to a model.
  // Paper/ink styling belongs to the background before deterministic composition.

  if (wantsJson(request)) {
    return NextResponse.json(
      {
        fallback: false,
        contentType,
        source: stageB ? "stage-b-background+deterministic-svg-composite" : "deterministic-svg-composite",
        tier: field.tier,
        streamlineCount: field.streamlines.length,
        polishRequested,
        windStageB: stageB ? stageB.cachePath : null,
        nextAction: "Request image/svg+xml to receive the Wind Sketch composite.",
      },
      { status: 200 },
    );
  }

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=300",
      "X-Evidence-Tier": field.tier,
      "X-Sketch-Source": stageB ? "stage-b-background+deterministic-svg-composite" : "deterministic-svg-composite",
      "X-Wind-Stage-B": stageB ? stageB.cachePath : "none",
    },
  });
}
