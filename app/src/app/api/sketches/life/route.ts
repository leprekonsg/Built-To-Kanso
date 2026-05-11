// Life Sketch route. Telemetry headers (see route.test.ts):
//   X-Evidence-Tier            always "prototype_visualisation".
//   X-Prompt-Id                present on GPT materialization attempts.
//   X-From-Cache               "prebake"|"true"|"false" on PNG responses only.
//   X-Sketch-Source            "accepted-gpt-image-2-prebake" on the golden path.
//   X-Sketch-Fallback          set on fallback responses. Values:
//                                "deterministic-anchor-svg"  no-key path
//                                "local-prebaked-anchor"     local PNG anchor path
//                                "missing-accepted-gpt-prebake" no accepted polished PNG exists
//                                "deterministic-sumi-e"      visual after materialization miss
//                                "openai-error"              OpenAI returned !ok
//                                "openai-timeout"            AbortController fired
//                                "openai-unreachable"        network failure
//   X-Life-Anchor-Source       cache-png | deterministic-svg | request-png.
//   X-Life-Anchor-Cache-Path   relative path under public/life-anchors/.
//   X-Life-Anchor-Scene        always "three-perspective-greybox-scene-manifest".
//   X-Life-Sketch-Mode         accepted-gpt-image-2-prebake | deterministic-sumi-e.
//   X-Life-Sketch-Cache-Path   accepted GPT Image 2 prebake path when present.
//   X-Life-Topology-Proof      local-plan-sketch | missing.
//   X-Life-Sketch-Candidates   count returned by the image edit call.
//   X-Life-Sketch-QA           accepted | accepted_from_cache.
//   X-Life-Sketch-QA-Model     Responses model used for candidate review.
//
// As of 2026-05-10 every failure mode lands on a calm 200 + local/deterministic
// fallback. The route never returns 5xx for an OpenAI miss; the UI renders a
// designed surface, not an alarming error toast.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { NextResponse } from "next/server";
import {
  buildLifeAnchorSceneManifest,
  getLifeAnchorCachePath,
  resolveLifeAnchorArtifact,
  type LifeAnchorSceneManifest,
  type LifeAnchorSource,
} from "@/server/anchors/lifeAnchor";
import { renderLifeSketchSumiSvg } from "@/server/anchors/lifeAnchorRender";
import type { TemplateId } from "@/server/geometry/types";
import { getPlanGeometry, isTemplateId } from "@/server/geometry/registry";
import {
  renderLifeAnchorFallbackSvg,
  sketchFallbackArtifact,
  wantsJson,
} from "@/server/openai/fallbackSvg";
import { generateLifeSketch, type LifeSketchReferenceBundle } from "@/server/openai/sketches";
import {
  resolveAcceptedLifeSketchArtifact,
  type AcceptedLifeSketchArtifact,
} from "@/server/sketches/lifeSketchAsset";
import { resolvePlanSketchArtifact } from "@/server/sketches/planSketchAsset";

const REFERENCES_DIR = resolve(process.cwd(), "public", "references");

type FallbackKind =
  | "deterministic-anchor-svg"
  | "local-prebaked-anchor"
  | "missing-accepted-gpt-prebake"
  | "deterministic-sumi-e"
  | "openai-error"
  | "openai-timeout"
  | "openai-unreachable";

async function readReferenceFile(name: string): Promise<Buffer | undefined> {
  try {
    return await readFile(resolve(REFERENCES_DIR, name));
  } catch {
    return undefined;
  }
}

async function loadLifeReferenceBundle(): Promise<LifeSketchReferenceBundle> {
  const [brand, material] = await Promise.all([
    readReferenceFile("brand-v3-poster.png"),
    readReferenceFile("hdb-material-board.png").then(async (buf) => buf ?? readReferenceFile("japandi-material-board.png")),
  ]);
  return {
    ...(brand ? { brand } : {}),
    ...(material ? { material } : {}),
  };
}

async function loadStructuralReferenceBundle(templateId: TemplateId): Promise<LifeSketchReferenceBundle> {
  const style = await loadLifeReferenceBundle();
  const topology = await resolvePlanSketchArtifact(templateId);
  return {
    ...(topology ? { topologyProof: topology.png } : {}),
    ...style,
  };
}

interface LifeSketchRequestBody {
  templateId?: string;
  // Optional base64 PNG for compatibility with older clients. Server-side
  // per-template anchors are preferred when present.
  anchorPng?: string;
}

interface LifeAnchorDescriptor {
  source: LifeAnchorSource;
  cachePath: string;
  manifest: LifeAnchorSceneManifest;
}

function anchorHeaders(anchor: LifeAnchorDescriptor): Record<string, string> {
  return {
    "X-Life-Anchor-Source": anchor.source,
    "X-Life-Anchor-Cache-Path": anchor.cachePath,
    "X-Life-Anchor-Scene": anchor.manifest.metadata.source,
  };
}

function referenceHeaders(references: LifeSketchReferenceBundle): Record<string, string> {
  return {
    "X-Life-Topology-Proof": references.topologyProof ? "local-plan-sketch" : "missing",
    "X-Life-Brand-Reference": references.brand ? "present" : "missing",
    "X-Life-Material-Reference": references.material || references.japandi ? "present" : "missing",
  };
}

function resultHeaders(result: Extract<Awaited<ReturnType<typeof generateLifeSketch>>, { ok: true }>): Record<string, string> {
  return {
    ...(result.qa ? { "X-Life-Sketch-QA": result.qa.status } : {}),
    ...(result.qa?.reviewerModel ? { "X-Life-Sketch-QA-Model": result.qa.reviewerModel } : {}),
    ...(result.candidateCount ? { "X-Life-Sketch-Candidates": String(result.candidateCount) } : {}),
    ...(result.acceptedCandidateIndex !== undefined
      ? { "X-Life-Sketch-Accepted-Candidate": String(result.acceptedCandidateIndex) }
      : {}),
  };
}

function acceptedLifeSketchHeaders(artifact: AcceptedLifeSketchArtifact): Record<string, string> {
  return {
    "X-Prompt-Id": artifact.metadata.promptKind,
    "X-Sketch-Source": artifact.source,
    "X-Life-Sketch-Mode": artifact.source,
    "X-Life-Sketch-Cache-Path": artifact.cachePath,
    "X-Life-Sketch-Metadata-Path": artifact.metadataPath,
    "X-Life-Sketch-QA": "accepted_from_prebake",
    "X-Life-Sketch-Candidates": String(artifact.metadata.candidateCount),
    "X-Life-Sketch-Accepted-Candidate": String(artifact.metadata.acceptedCandidateIndex),
    ...(artifact.metadata.reviewerModel ? { "X-Life-Sketch-QA-Model": artifact.metadata.reviewerModel } : {}),
  };
}

function lifeSketchReviewContext(anchor: LifeAnchorDescriptor): { manifestSummary: string } {
  const manifest = anchor.manifest;
  const rooms = manifest.rooms.map((room) => `${room.id}:${room.kind}`).join(",");
  const openings = manifest.openings
    .map((opening) => `${opening.id}:${opening.kind}@${opening.position[0].toFixed(1)},${opening.position[2].toFixed(1)}`)
    .join(",");
  const fixed = manifest.fixedElements
    .map((element) => `${element.id}:${element.kind}@${element.position[0].toFixed(1)},${element.position[2].toFixed(1)}`)
    .join(",");

  return {
    manifestSummary: [
      `template=${manifest.templateId}`,
      `source=${manifest.metadata.source}`,
      `rooms=${rooms}`,
      `openings=${openings}`,
      `fixed=${fixed}`,
      `camera=${manifest.camera.position.map((v) => v.toFixed(2)).join(",")}`,
      `lookAt=${manifest.camera.lookAt.map((v) => v.toFixed(2)).join(",")}`,
    ].join("; "),
  };
}

function acceptedLifeSketchJson(
  artifact: AcceptedLifeSketchArtifact,
  anchor: LifeAnchorDescriptor,
) {
  return {
    fallback: false,
    contentType: artifact.contentType,
    reason: "accepted_gpt_image_2_prebake",
    nextAction: "Serving the QA-accepted ChatGPT Image Life Sketch for the supported polished demo path.",
    tier: artifact.tier,
    source: artifact.source,
    cachePath: artifact.cachePath,
    metadataPath: artifact.metadataPath,
    candidateCount: artifact.metadata.candidateCount,
    acceptedCandidateIndex: artifact.metadata.acceptedCandidateIndex,
    reviewerModel: artifact.metadata.reviewerModel,
    rejectedCandidates: artifact.metadata.rejectedCandidates,
    anchor: {
      source: anchor.source,
      cachePath: anchor.cachePath,
      scene: anchor.manifest.metadata.source,
      complianceTruth: anchor.manifest.metadata.complianceTruth,
      topologyProof: anchor.manifest.metadata.topologyProof,
    },
  };
}

function acceptedLifeSketchPngResponse(
  artifact: AcceptedLifeSketchArtifact,
  anchor: LifeAnchorDescriptor,
  extraHeaders: Record<string, string> = {},
) {
  return new NextResponse(new Uint8Array(artifact.png), {
    status: 200,
    headers: {
      "Content-Type": artifact.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Evidence-Tier": artifact.tier,
      "X-From-Cache": "prebake",
      ...anchorHeaders(anchor),
      ...acceptedLifeSketchHeaders(artifact),
      ...extraHeaders,
    },
  });
}

function deterministicLifeSketchJson(
  anchor: LifeAnchorDescriptor,
  overrides?: { fallback?: boolean; reason?: string; nextAction?: string; promptId?: string },
) {
  return {
    fallback: overrides?.fallback ?? false,
    contentType: "image/svg+xml",
    reason: overrides?.reason ?? "deterministic_sumi_e_life_sketch",
    nextAction:
      overrides?.nextAction ??
      "Accepted GPT Image 2 prebake is missing. Using the deterministic sumi-e Life Sketch; run the Life Sketch prebake for the polished demo path.",
    tier: anchor.manifest.metadata.tier,
    promptId: overrides?.promptId,
    source: "deterministic-sumi-e-life-sketch",
    anchor: {
      source: anchor.source,
      cachePath: anchor.cachePath,
      scene: anchor.manifest.metadata.source,
      complianceTruth: anchor.manifest.metadata.complianceTruth,
      topologyProof: anchor.manifest.metadata.topologyProof,
    },
  };
}

function deterministicLifeSketchSvgResponse(
  anchor: LifeAnchorDescriptor,
  extraHeaders: Record<string, string> = {},
) {
  return new NextResponse(renderLifeSketchSumiSvg(anchor.manifest), {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=300",
      "X-Evidence-Tier": anchor.manifest.metadata.tier,
      "X-Sketch-Source": "deterministic-sumi-e-life-sketch",
      "X-Life-Sketch-Mode": "deterministic-sumi-e",
      ...anchorHeaders(anchor),
      ...extraHeaders,
    },
  });
}

function fallbackSvgResponse(
  fallback: ReturnType<typeof sketchFallbackArtifact>,
  anchor: LifeAnchorDescriptor,
  kind: FallbackKind = "deterministic-anchor-svg",
  extraHeaders: Record<string, string> = {},
) {
  return new NextResponse(fallback.svg, {
    status: 200,
    headers: {
      "Content-Type": fallback.contentType,
      "Cache-Control": "private, max-age=300",
      "X-Evidence-Tier": fallback.tier,
      "X-Sketch-Fallback": kind,
      ...anchorHeaders(anchor),
      ...extraHeaders,
    },
  });
}

function localAnchorJson(
  anchor: Extract<Awaited<ReturnType<typeof resolveLifeAnchorArtifact>>, { source: "cache-png" }>,
  overrides?: { reason?: string; nextAction?: string; promptId?: string },
) {
  return {
    fallback: true,
    contentType: anchor.contentType,
    reason: overrides?.reason ?? "local_prebaked_anchor",
    nextAction: overrides?.nextAction ?? "Using the local prebaked Life anchor until GPT Image 2 materialization is configured.",
    tier: anchor.manifest.metadata.tier,
    promptId: overrides?.promptId,
    source: "local-prebaked-anchor",
    anchor: {
      source: anchor.source,
      cachePath: anchor.cachePath,
      scene: anchor.manifest.metadata.source,
      complianceTruth: anchor.manifest.metadata.complianceTruth,
      topologyProof: anchor.manifest.metadata.topologyProof,
    },
  };
}

function localAnchorPngResponse(
  anchor: Extract<Awaited<ReturnType<typeof resolveLifeAnchorArtifact>>, { source: "cache-png" }>,
  extraHeaders: Record<string, string> = {},
) {
  return new NextResponse(new Uint8Array(anchor.png), {
    status: 200,
    headers: {
      "Content-Type": anchor.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Evidence-Tier": anchor.manifest.metadata.tier,
      "X-From-Cache": "true",
      "X-Sketch-Source": "local-prebaked-anchor",
      "X-Sketch-Fallback": "local-prebaked-anchor",
      ...anchorHeaders(anchor),
      ...extraHeaders,
    },
  });
}

function wantsSvg(request: Request): boolean {
  return request.headers.get("accept")?.includes("image/svg+xml") ?? false;
}

function materializeRequested(request: Request): boolean {
  return new URL(request.url).searchParams.get("materialize") === "1";
}

function anchorOnlyRequested(request: Request): boolean {
  const params = new URL(request.url).searchParams;
  return params.get("anchor") === "1" || params.get("visual") === "anchor";
}

function requestAnchor(plan: Parameters<typeof buildLifeAnchorSceneManifest>[0]): LifeAnchorDescriptor {
  const manifest = buildLifeAnchorSceneManifest(plan);
  return {
    source: "request-png",
    cachePath: "request:anchorPng",
    manifest,
  };
}

function deterministicAnchor(plan: Parameters<typeof buildLifeAnchorSceneManifest>[0]): LifeAnchorDescriptor {
  const cache = getLifeAnchorCachePath(plan.templateId);
  return {
    source: "deterministic-svg",
    cachePath: cache.relativePath,
    manifest: buildLifeAnchorSceneManifest(plan),
  };
}

function fallbackKindFor(reason: string): FallbackKind {
  if (reason === "openai_timeout") return "openai-timeout";
  if (reason === "openai_unreachable") return "openai-unreachable";
  if (reason === "openai_error") return "openai-error";
  return "deterministic-sumi-e";
}

function calmFallbackCopy(reason: string): { reason: string; nextAction: string } {
  if (reason === "openai_timeout") {
    return {
      reason: "openai_timeout",
      nextAction: "OpenAI did not respond in time. The deterministic Life Sketch is shown; retry materialization later.",
    };
  }
  if (reason === "openai_unreachable") {
    return {
      reason: "openai_unreachable",
      nextAction: "Could not reach OpenAI. The deterministic Life Sketch is shown; retry when the network recovers.",
    };
  }
  if (reason === "openai_error") {
    return {
      reason: "openai_error",
      nextAction: "OpenAI declined the request. The deterministic Life Sketch is shown; geometry remains the source of truth.",
    };
  }
  return {
    reason: "png_or_openai_unavailable",
    nextAction: "Set OPENAI_API_KEY for optional materialization, or use the deterministic sumi-e Life Sketch.",
  };
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

  const plan = getPlanGeometry(body.templateId);

  if (!body.anchorPng || typeof body.anchorPng !== "string") {
    const anchor = await resolveLifeAnchorArtifact(plan);
    if (anchorOnlyRequested(request) && wantsSvg(request)) {
      const deterministic = deterministicAnchor(plan);
      const fallback = sketchFallbackArtifact("life-anchor", renderLifeAnchorFallbackSvg(plan));
      return fallbackSvgResponse(fallback, deterministic);
    }

    if (anchorOnlyRequested(request) && anchor.source === "cache-png") {
      if (wantsJson(request)) return NextResponse.json(localAnchorJson(anchor), { status: 200, headers: anchorHeaders(anchor) });
      return localAnchorPngResponse(anchor);
    }

    const anchorDescriptor: LifeAnchorDescriptor = {
      source: anchor.source,
      cachePath: anchor.cachePath,
      manifest: anchor.manifest,
    };

    if (!materializeRequested(request)) {
      const accepted = await resolveAcceptedLifeSketchArtifact(body.templateId);
      if (accepted) {
        if (wantsJson(request)) {
          return NextResponse.json(acceptedLifeSketchJson(accepted, anchorDescriptor), {
            status: 200,
            headers: { ...anchorHeaders(anchorDescriptor), ...acceptedLifeSketchHeaders(accepted) },
          });
        }
        return acceptedLifeSketchPngResponse(accepted, anchorDescriptor);
      }

      if (wantsJson(request)) {
        return NextResponse.json(deterministicLifeSketchJson(anchorDescriptor, {
          fallback: true,
          reason: "missing_accepted_gpt_prebake",
          nextAction: "No accepted GPT Image 2 Life Sketch prebake is present for this template. Run the prebake before treating this as a supported polished demo state.",
        }), {
          status: 200,
          headers: {
            ...anchorHeaders(anchorDescriptor),
            "X-Sketch-Fallback": "missing-accepted-gpt-prebake",
            "X-Sketch-Source": "deterministic-sumi-e-life-sketch",
            "X-Life-Sketch-Mode": "deterministic-sumi-e",
          },
        });
      }
      return deterministicLifeSketchSvgResponse(anchorDescriptor, {
        "X-Sketch-Fallback": "missing-accepted-gpt-prebake",
      });
    }

    if (anchor.source === "cache-png") {
      const references = await loadStructuralReferenceBundle(body.templateId);
      const result = await generateLifeSketch(anchor.png, references, lifeSketchReviewContext(anchor));

      if (result.ok) {
        return new NextResponse(new Uint8Array(result.png), {
          status: 200,
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "private, max-age=300",
            "X-Evidence-Tier": result.tier,
            "X-Prompt-Id": result.promptId,
            "X-From-Cache": String(result.fromCache),
            ...anchorHeaders(anchor),
            ...referenceHeaders(references),
            ...resultHeaders(result),
          },
        });
      }

      // Any failure (no_cached_no_key, openai_error/timeout/unreachable,
      // cache_env_error) falls through to the deterministic sumi-e Life Sketch
      // with calm telemetry. We never surface a 5xx to the UI.
      const kind = fallbackKindFor(result.reason);
      const copy = calmFallbackCopy(result.reason);
      if (wantsJson(request)) {
        return NextResponse.json(
          deterministicLifeSketchJson(anchorDescriptor, {
            fallback: true,
            reason: copy.reason,
            nextAction: copy.nextAction,
            promptId: result.promptId,
          }),
          { status: 200, headers: { ...anchorHeaders(anchorDescriptor), ...referenceHeaders(references) } },
        );
      }
      return deterministicLifeSketchSvgResponse(anchorDescriptor, {
        "X-Sketch-Fallback": kind,
        "X-Prompt-Id": result.promptId,
        ...referenceHeaders(references),
      });
    }

    if (wantsJson(request)) {
      return NextResponse.json(
        deterministicLifeSketchJson(anchorDescriptor, {
          fallback: true,
          reason: "anchor_png_missing",
          nextAction: "Using the deterministic sumi-e Life Sketch because no local anchor PNG is available for GPT materialization.",
        }),
        { status: 200, headers: anchorHeaders(anchorDescriptor) },
      );
    }

    return deterministicLifeSketchSvgResponse(anchorDescriptor, {
      "X-Sketch-Fallback": "missing-accepted-gpt-prebake",
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

  const references = await loadStructuralReferenceBundle(body.templateId);
  const suppliedAnchor = requestAnchor(plan);
  const result = await generateLifeSketch(anchorBuffer, references, lifeSketchReviewContext(suppliedAnchor));

  if (!result.ok) {
    const kind = fallbackKindFor(result.reason);
    const copy = calmFallbackCopy(result.reason);

    if (wantsJson(request)) {
      return NextResponse.json(
        deterministicLifeSketchJson(suppliedAnchor, {
          fallback: true,
          reason: copy.reason,
          nextAction: copy.nextAction,
          promptId: result.promptId,
        }),
        { status: 200, headers: { ...anchorHeaders(suppliedAnchor), ...referenceHeaders(references) } },
      );
    }

    return deterministicLifeSketchSvgResponse(suppliedAnchor, {
      "X-Sketch-Fallback": kind,
      "X-Prompt-Id": result.promptId,
      ...referenceHeaders(references),
    });
  }

  return new NextResponse(new Uint8Array(result.png), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=300",
      "X-Evidence-Tier": result.tier,
      "X-Prompt-Id": result.promptId,
      "X-From-Cache": String(result.fromCache),
      ...anchorHeaders(suppliedAnchor),
      ...referenceHeaders(references),
      ...resultHeaders(result),
    },
  });
}
