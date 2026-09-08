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
import { geometryReleaseResponse } from "@/server/geometry/releaseResponse";
import { resolveAcceptedLifeSketchArtifact } from "@/server/sketches/lifeSketchAsset";
import { getPlanGeometry, isTemplateId } from "@/server/geometry/registry";
import { resolveLifeAnchorArtifact } from "@/server/anchors/lifeAnchor";
import { generateResonanceHour } from "@/server/openai/sketches";
import { resonanceHourMetadata, resolveResonanceHourArtifact } from "@/server/sketches/resonanceHourAsset";

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

  if (!body || typeof body.templateId !== "string" || !isTemplateId(body.templateId)) {
    return NextResponse.json(
      { error: "templateId must be one of: tampines-greenweave, tengah-5room, resale-exec-1990s." },
      { status: 400 },
    );
  }

  const blocked = geometryReleaseResponse(body.templateId);
  if (blocked) return blocked;
  const accepted = await resolveAcceptedLifeSketchArtifact(body.templateId);
  const materialize = new URL(request.url).searchParams.get("materialize") === "1";
  if (accepted) {
    if (!materialize) {
      const prebake = await resolveResonanceHourArtifact(body.templateId, undefined, accepted);
      if (prebake) return new NextResponse(new Uint8Array(prebake.png), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "private, no-cache",
          "X-Evidence-Tier": prebake.metadata.evidenceTier,
          "X-Prompt-Id": prebake.metadata.promptKind,
          "X-From-Cache": "prebake",
          "X-Sketch-Source": "resonance-hour-prebake",
          "X-Resonance-Hour-Base": "accepted-gpt-image-2-prebake",
        },
      });
    }
    const result = materialize ? await generateResonanceHour(accepted.png) : null;
    if (result?.ok) {
      const metadata = resonanceHourMetadata(accepted, result.png, result.generationModel ?? "");
      return new NextResponse(new Uint8Array(result.png), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "private, no-cache",
          "X-Evidence-Tier": result.tier,
          "X-Prompt-Id": result.promptId,
          "X-From-Cache": String(result.fromCache),
          "X-Sketch-Source": "resonance-hour-background",
          "X-Resonance-Hour-Base": "accepted-gpt-image-2-prebake",
          "X-Resonance-Hour-Metadata": Buffer.from(JSON.stringify(metadata)).toString("base64"),
        },
      });
    }
    return new NextResponse(new Uint8Array(accepted.png), {
      status: 200,
      headers: {
        "Content-Type": accepted.contentType,
        "Cache-Control": "private, no-cache",
        "X-Evidence-Tier": accepted.tier,
        "X-Sketch-Source": "accepted-gpt-image-2-prebake",
        "X-Sketch-Fallback": result && !result.ok ? result.reason : "missing-current-resonance-prebake",
      },
    });
  }

  const plan = getPlanGeometry(body.templateId);
  const anchor = await resolveLifeAnchorArtifact(plan);
  if (anchor.source === "cache-png") {
    return new NextResponse(new Uint8Array(anchor.png), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-cache",
        "X-Evidence-Tier": anchor.manifest.metadata.tier,
        "X-Sketch-Source": "local-prebaked-anchor",
        "X-Sketch-Fallback": "missing-current-accepted-life-sketch",
      },
    });
  }

  return NextResponse.json(
    {
      error: "no_3d_source_image",
      message:
        "Resonance Hour requires a current accepted Life Sketch. Run prebake:anchors and prebake:life-sketches before prebake:resonance-hour.",
    },
    { status: 503 },
  );
}
