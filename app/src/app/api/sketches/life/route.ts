// Life Sketch route. Telemetry headers (see route.test.ts):
//   X-Evidence-Tier            always "prototype_visualisation".
//   X-Prompt-Id                present on PNG and on no-key SVG fall-through.
//   X-From-Cache               "true"|"false" on PNG responses only.
//   X-Sketch-Source            "local-prebaked-anchor" on no-cloud anchor PNG.
//   X-Sketch-Fallback          set on fallback responses. Values:
//                                "deterministic-anchor-svg"  no-key path
//                                "local-prebaked-anchor"     local PNG anchor path
//                                "openai-error"              OpenAI returned !ok
//                                "openai-timeout"            AbortController fired
//                                "openai-unreachable"        network failure
//   X-Life-Anchor-Source       cache-png | deterministic-svg | request-png.
//   X-Life-Anchor-Cache-Path   relative path under public/life-anchors/.
//   X-Life-Anchor-Scene        always "three-orthographic-scene-manifest".
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
import { getPlanGeometry, isTemplateId } from "@/server/geometry/registry";
import {
  renderLifeAnchorFallbackSvg,
  sketchFallbackArtifact,
  wantsJson,
} from "@/server/openai/fallbackSvg";
import { generateLifeSketch, type LifeSketchReferenceBundle } from "@/server/openai/sketches";

const REFERENCES_DIR = resolve(process.cwd(), "public", "references");

type FallbackKind =
  | "deterministic-anchor-svg"
  | "local-prebaked-anchor"
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
  const [brand, japandi] = await Promise.all([
    readReferenceFile("brand-v3-poster.png"),
    readReferenceFile("japandi-material-board.png"),
  ]);
  return {
    ...(brand ? { brand } : {}),
    ...(japandi ? { japandi } : {}),
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

function fallbackJson(
  fallback: ReturnType<typeof sketchFallbackArtifact>,
  anchor: LifeAnchorDescriptor,
  overrides?: { reason?: string; nextAction?: string; promptId?: string },
) {
  return {
    fallback: fallback.fallback,
    contentType: fallback.contentType,
    reason: overrides?.reason ?? fallback.reason,
    nextAction: overrides?.nextAction ?? fallback.nextAction,
    tier: fallback.tier,
    promptId: overrides?.promptId,
    anchor: {
      source: anchor.source,
      cachePath: anchor.cachePath,
      scene: anchor.manifest.metadata.source,
      complianceTruth: anchor.manifest.metadata.complianceTruth,
    },
  };
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
  return "deterministic-anchor-svg";
}

function calmFallbackCopy(reason: string): { reason: string; nextAction: string } {
  if (reason === "openai_timeout") {
    return {
      reason: "openai_timeout",
      nextAction: "OpenAI did not respond in time. The deterministic anchor is shown; retry in a moment.",
    };
  }
  if (reason === "openai_unreachable") {
    return {
      reason: "openai_unreachable",
      nextAction: "Could not reach OpenAI. The deterministic anchor is shown; retry when the network recovers.",
    };
  }
  if (reason === "openai_error") {
    return {
      reason: "openai_error",
      nextAction: "OpenAI declined the request. The deterministic anchor is shown; geometry remains the source of truth.",
    };
  }
  return {
    reason: "png_or_openai_unavailable",
    nextAction: "Set OPENAI_API_KEY for materialization, or request image/svg+xml to use the deterministic anchor.",
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
    if (wantsSvg(request)) {
      const deterministic = deterministicAnchor(plan);
      const fallback = sketchFallbackArtifact("life-anchor", renderLifeAnchorFallbackSvg(plan));
      return fallbackSvgResponse(fallback, deterministic);
    }

    if (anchor.source === "cache-png") {
      if (!materializeRequested(request)) {
        if (wantsJson(request)) return NextResponse.json(localAnchorJson(anchor), { status: 200, headers: anchorHeaders(anchor) });
        return localAnchorPngResponse(anchor);
      }

      const references = await loadLifeReferenceBundle();
      const result = await generateLifeSketch(anchor.png, references);

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
          },
        });
      }

      // Any failure (no_cached_no_key, openai_error/timeout/unreachable,
      // cache_env_error) falls through to the local PNG anchor with calm
      // telemetry. We never surface a 5xx to the UI.
      const kind = fallbackKindFor(result.reason);
      const copy = calmFallbackCopy(result.reason);
      if (wantsJson(request)) {
        return NextResponse.json(
          localAnchorJson(anchor, {
            reason: copy.reason,
            nextAction: copy.nextAction,
            promptId: result.promptId,
          }),
          { status: 200, headers: anchorHeaders(anchor) },
        );
      }
      return localAnchorPngResponse(anchor, {
        "X-Sketch-Fallback": kind === "deterministic-anchor-svg" ? "local-prebaked-anchor" : kind,
        "X-Prompt-Id": result.promptId,
      });
    }

    const svg = renderLifeAnchorFallbackSvg(plan);
    const fallback = sketchFallbackArtifact("life-anchor", svg);

    if (wantsJson(request)) {
      return NextResponse.json(
        fallbackJson(fallback, anchor),
        { status: 200, headers: anchorHeaders(anchor) },
      );
    }

    return fallbackSvgResponse(fallback, anchor);
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

  const references = await loadLifeReferenceBundle();
  const result = await generateLifeSketch(anchorBuffer, references);
  const suppliedAnchor = requestAnchor(plan);

  if (!result.ok) {
    const svg = renderLifeAnchorFallbackSvg(plan);
    const fallback = sketchFallbackArtifact("life-anchor", svg);
    const kind = fallbackKindFor(result.reason);
    const copy = calmFallbackCopy(result.reason);

    if (wantsJson(request)) {
      return NextResponse.json(
        fallbackJson(fallback, suppliedAnchor, {
          reason: copy.reason,
          nextAction: copy.nextAction,
          promptId: result.promptId,
        }),
        { status: 200, headers: anchorHeaders(suppliedAnchor) },
      );
    }

    return fallbackSvgResponse(fallback, suppliedAnchor, kind, { "X-Prompt-Id": result.promptId });
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
    },
  });
}
