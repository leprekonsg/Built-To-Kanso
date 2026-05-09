import { NextResponse } from "next/server";
import { getPlanGeometry } from "@/server/geometry/registry";
import {
  renderWindSketchSvg,
  wantsJson,
} from "@/server/openai/fallbackSvg";
import { generateWindSketchMicroPolish } from "@/server/openai/sketches";
import { rasterizeSvgToPng } from "@/server/openai/svgRaster";
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
    condition: body.condition ?? "ne_monsoon",
  });
  if (typeof valid === "string") {
    return NextResponse.json({ error: "invalid_wind_sketch_request", message: valid }, { status: 400 });
  }

  const plan = getPlanGeometry(valid.templateId);
  const field = buildTier4Simulation(valid);
  const svg = renderWindSketchSvg(plan, field);
  const contentType = "image/svg+xml";

  const url = new URL(request.url);
  const polishRequested = isPolishRequested(url.searchParams);

  // Stage D micro-polish (brief Section 16.3): purely additive ink-paper
  // restyle. Geometry preservation is enforced by the prompt, not the model.
  // Any failure path returns the un-polished SVG.
  if (polishRequested && process.env.OPENAI_API_KEY) {
    const raster = await rasterizeSvgToPng(svg);
    if (raster.ok) {
      const result = await generateWindSketchMicroPolish(raster.png);
      if (result.ok) {
        return new NextResponse(new Uint8Array(result.png), {
          status: 200,
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "private, max-age=300",
            "X-Evidence-Tier": result.tier,
            "X-Prompt-Id": result.promptId,
            "X-From-Cache": String(result.fromCache),
            "X-Sketch-Source": "deterministic-svg-composite+micro-polish",
          },
        });
      }
    }
  }

  if (wantsJson(request)) {
    return NextResponse.json(
      {
        fallback: false,
        contentType,
        source: "deterministic-svg-composite",
        tier: field.tier,
        streamlineCount: field.streamlines.length,
        polishRequested,
        nextAction: "Request image/svg+xml to receive the deterministic Wind Sketch composite.",
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
      "X-Sketch-Source": "deterministic-svg-composite",
    },
  });
}
