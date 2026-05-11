// Resonance Hour route. Produces the journey's closing image per the brief's
// Section 20 / 21 vision: a 3D Life Sketch where evening wind has just
// arrived — sheer curtain barely lifts, dust motes catch the late balcony
// light, leaves tilt subtly. No arrows, no streamlines; wind is implied
// through environmental cues. The Wind Sketch top-down remains airflow
// source of truth, and plan-geometry.json remains compliance source of truth.
//
// On a true OpenAI miss (no key, openai_error/timeout/unreachable) the route
// degrades calmly: it returns 200 with image/png from the accepted Life
// Sketch (unaltered) so the UI never sees a 5xx. The X-Sketch-Source header
// lets prebake scripts distinguish a polished response from a passthrough.
import { NextResponse } from "next/server";
import { resolveAcceptedLifeSketchArtifact } from "@/server/sketches/lifeSketchAsset";
import { getPlanGeometry, isTemplateId } from "@/server/geometry/registry";
import { resolveLifeAnchorArtifact } from "@/server/anchors/lifeAnchor";
import { generateResonanceHour } from "@/server/openai/sketches";

interface ResonanceHourRequestBody {
  templateId?: unknown;
}

export async function POST(request: Request) {
  let body: ResonanceHourRequestBody;
  try {
    body = (await request.json()) as ResonanceHourRequestBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (typeof body.templateId !== "string" || !isTemplateId(body.templateId)) {
    return NextResponse.json(
      { error: "templateId must be one of: tampines-greenweave, tengah-5room, resale-exec-1990s." },
      { status: 400 },
    );
  }

  // Source image: the accepted GPT Image 2 Life Sketch if the prebake exists,
  // otherwise the locally-prebaked greybox anchor PNG. We deliberately do NOT
  // fall back to the deterministic SVG anchor — the resonance-hour-background
  // prompt expects a photoreal base to add wind cues on top of.
  const accepted = await resolveAcceptedLifeSketchArtifact(body.templateId);
  if (accepted) {
    const result = await generateResonanceHour(accepted.png);
    if (result.ok) {
      return new NextResponse(new Uint8Array(result.png), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "private, max-age=300",
          "X-Evidence-Tier": result.tier,
          "X-Prompt-Id": result.promptId,
          "X-From-Cache": String(result.fromCache),
          "X-Sketch-Source": "resonance-hour-background",
          "X-Resonance-Hour-Base": "accepted-gpt-image-2-prebake",
        },
      });
    }
    return new NextResponse(new Uint8Array(accepted.png), {
      status: 200,
      headers: {
        "Content-Type": accepted.contentType,
        "Cache-Control": "private, max-age=300",
        "X-Evidence-Tier": accepted.tier,
        "X-Sketch-Source": "accepted-gpt-image-2-prebake",
        "X-Sketch-Fallback": result.reason,
      },
    });
  }

  const plan = getPlanGeometry(body.templateId);
  const anchor = await resolveLifeAnchorArtifact(plan);
  if (anchor.source === "cache-png") {
    const anchorBuffer = anchor.png;
    const localPng = Buffer.isBuffer(anchorBuffer) ? anchorBuffer : Buffer.from(anchorBuffer);
    const result = await generateResonanceHour(localPng);
    if (result.ok) {
      return new NextResponse(new Uint8Array(result.png), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "private, max-age=300",
          "X-Evidence-Tier": result.tier,
          "X-Prompt-Id": result.promptId,
          "X-From-Cache": String(result.fromCache),
          "X-Sketch-Source": "resonance-hour-background",
          "X-Resonance-Hour-Base": "local-prebaked-anchor",
        },
      });
    }
    return new NextResponse(new Uint8Array(localPng), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=300",
        "X-Evidence-Tier": anchor.manifest.metadata.tier,
        "X-Sketch-Source": "local-prebaked-anchor",
        "X-Sketch-Fallback": result.reason,
      },
    });
  }

  return NextResponse.json(
    {
      error: "no_3d_source_image",
      message:
        "Resonance Hour requires either the accepted GPT Image 2 Life Sketch (life-sketches/<templateId>/accepted.png) or the local prebaked anchor (life-anchors/<templateId>/anchor.png). Run prebake:anchors and prebake:life-sketches first.",
    },
    { status: 503 },
  );
}
