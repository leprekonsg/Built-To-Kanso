// Wind Sketch Stage B route. Generates the styled top-down sumi-e background
// PNG (no streamlines, no furniture, no labels) for a given template by
// calling GPT Image 2 with the wind-sketch-base prompt over the existing
// topology proof. The result is the input for Stage C deterministic SVG
// composition. Cached output lives at public/wind-base/<templateId>/base.png
// once prebake-wind-base writes it.
import { NextResponse } from "next/server";
import { geometryOutputResponse } from "@/server/geometry/releaseResponse";
import { isTemplateId } from "@/server/geometry/registry";
import { generateWindSketchBase } from "@/server/openai/sketches";
import { resolveCurrentPlanSketchArtifact } from "@/server/sketches/planSketchAsset";
import { buildWindBaseMetadata } from "@/server/sketches/windBaseAsset";

interface WindBaseRequestBody {
  templateId?: unknown;
}

export async function POST(request: Request) {
  let body: WindBaseRequestBody;
  try {
    body = (await request.json()) as WindBaseRequestBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!body || typeof body.templateId !== "string" || !isTemplateId(body.templateId)) {
    return NextResponse.json(
      { error: "templateId must be one of: tampines-greenweave, tengah-5room, resale-exec-1990s." },
      { status: 400 },
    );
  }

  // The topology proof is the locked-geometry input — Stage B styles it and
  // strips furniture/labels per prompt. Without the topology proof we can't
  // produce a sumi-e Stage B background.
  const blocked = geometryOutputResponse(body.templateId, "wind_sketch");
  if (blocked) return blocked;
  const topology = await resolveCurrentPlanSketchArtifact(body.templateId);
  if (!topology) {
    return NextResponse.json(
      {
        error: "missing_topology_proof",
        message:
          "Wind Sketch Stage B requires the topology proof. Run prebake:plans first to produce public/plan-sketches/<templateId>/plan.png.",
      },
      { status: 503 },
    );
  }

  const result = await generateWindSketchBase(topology.png);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: "wind_base_generation_failed",
        reason: result.reason,
        detail: result.detail,
        message:
          "Stage B generation failed. Verify OPENAI_API_KEY is set and the topology proof is current. The route layer does not silently fall back here.",
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
      "X-Sketch-Source": "wind-sketch-base",
      "X-Wind-Base-Metadata": Buffer.from(JSON.stringify(buildWindBaseMetadata(body.templateId, topology, result.png, result.generationModel ?? ""))).toString("base64"),
    },
  });
}
