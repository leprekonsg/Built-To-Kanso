// Sketch generators for Plan Sketch, Life Sketch, and Empty Room hero.
// All three are tier "prototype_visualisation" (evidence.ts).
//
// Cache is checked first. On a true miss with no API key, we return a typed
// failure so the route layer can surface a calm degradation message instead
// of failing open.

import { hashBytes } from "@/lib/imageHash";
import { getOpenAIImagePrompt, type ImagePromptKind } from "@/server/folio/prompts";
import { callOpenAIImage, getOpenAIImageConfig } from "./client";
import { getConfiguredSketchCache, keyFor } from "./cache";

// Sketches are tier "prototype_visualisation" per evidence.ts. Pinning the
// literal (not widening to EvidenceTier) lets the success type stay narrow
// so consumers don't need to re-narrow.
const SKETCH_TIER = "prototype_visualisation" as const;

export type SketchSuccess = {
  ok: true;
  png: Buffer;
  fromCache: boolean;
  tier: typeof SKETCH_TIER;
  promptId: ImagePromptKind;
};

export type SketchFailure = {
  ok: false;
  reason:
    | "no_cached_no_key"
    | "cache_env_error"
    | "openai_error"
    | "openai_unreachable"
    | "openai_timeout";
  promptId: ImagePromptKind;
  detail?: string;
};

export type SketchResult = SketchSuccess | SketchFailure;

// Five sealed seeds for the empty-room hero rotation. Hand-picked words —
// not generated — so the rotation order is reproducible across machines.
const HERO_SEEDS: readonly [string, string, string, string, string] = [
  "kanso-empty-bone",
  "kanso-empty-balcony",
  "kanso-empty-amber",
  "kanso-empty-sage",
  "kanso-empty-hush",
];

const HERO_VARIANT_CUES: readonly [string, string, string, string, string] = [
  "Variant cue: north-east monsoon softness, balcony light, empty threshold.",
  "Variant cue: morning east light, quiet balcony reveal, modest HDB proportions.",
  "Variant cue: evening west-amber cast light treated as heat to design around.",
  "Variant cue: rain-cooled monsoon sage undertone, still empty room.",
  "Variant cue: blue-hour hush, concrete-grey edge, no decorative additions.",
];

async function runOrCache(
  promptId: ImagePromptKind,
  inputs: { imageHashes?: string[]; seed?: string },
  buildRequest: () => Parameters<typeof callOpenAIImage>[0],
): Promise<SketchResult> {
  const key = keyFor(promptId, inputs);
  const cacheResult = getConfiguredSketchCache();
  if (!cacheResult.ok) {
    return { ok: false, reason: cacheResult.reason, promptId, detail: cacheResult.message };
  }

  const cached = await cacheResult.cache.get(key);
  if (cached) {
    return { ok: true, png: cached, fromCache: true, tier: SKETCH_TIER, promptId };
  }

  const config = getOpenAIImageConfig();
  if (!config.ok) {
    return { ok: false, reason: "no_cached_no_key", promptId, detail: config.message };
  }

  const result = await callOpenAIImage(buildRequest());
  if (!result.ok) {
    return { ok: false, reason: result.reason === "missing_api_key" ? "no_cached_no_key" : result.reason, promptId, detail: result.detail };
  }

  await cacheResult.cache.put(key, result.png);
  return { ok: true, png: result.png, fromCache: false, tier: SKETCH_TIER, promptId };
}

export async function generatePlanSketch(planSvgPng: Buffer): Promise<SketchResult> {
  const spec = getOpenAIImagePrompt("plan-sketch-style-transfer");
  const imageHash = hashBytes(planSvgPng);
  return runOrCache(
    spec.kind,
    { imageHashes: [imageHash] },
    () => ({ mode: "edit", promptId: spec.kind, prompt: spec.prompt, image: planSvgPng }),
  );
}

// Optional brand-v3 + Japandi reference bundle (brief Section 16.2). Each
// reference contributes to the cache key so swapping references invalidates.
// Loaded by callers from app/public/references — see that directory's README.
export interface LifeSketchReferenceBundle {
  brand?: Buffer;
  japandi?: Buffer;
}

export async function generateLifeSketch(
  anchorPng: Buffer,
  references: LifeSketchReferenceBundle = {},
): Promise<SketchResult> {
  const spec = getOpenAIImagePrompt("life-sketch-from-anchor");
  const referenceImages = [references.brand, references.japandi].filter(
    (buf): buf is Buffer => Buffer.isBuffer(buf),
  );
  const imageHashes = [hashBytes(anchorPng), ...referenceImages.map((buf) => hashBytes(buf))];
  return runOrCache(
    spec.kind,
    { imageHashes },
    () => ({
      mode: "edit",
      promptId: spec.kind,
      prompt: spec.prompt,
      image: anchorPng,
      ...(referenceImages.length > 0 ? { referenceImages } : {}),
    }),
  );
}

export async function generateWindSketchMicroPolish(svgRasterPng: Buffer): Promise<SketchResult> {
  const spec = getOpenAIImagePrompt("wind-sketch-micro-polish");
  const imageHash = hashBytes(svgRasterPng);
  return runOrCache(
    spec.kind,
    { imageHashes: [imageHash] },
    () => ({ mode: "edit", promptId: spec.kind, prompt: spec.prompt, image: svgRasterPng }),
  );
}

export type HeroRotationIndex = 0 | 1 | 2 | 3 | 4;

export async function generateEmptyRoomHero(rotationIndex: HeroRotationIndex): Promise<SketchResult> {
  const spec = getOpenAIImagePrompt("empty-room-hero");
  const seed = HERO_SEEDS[rotationIndex];
  const prompt = [spec.prompt, HERO_VARIANT_CUES[rotationIndex]].join("\n");
  return runOrCache(
    spec.kind,
    { seed },
    () => ({ mode: "generate", promptId: spec.kind, prompt }),
  );
}

// Exposed so prebake script and route handlers can reason about the
// rotation cardinality without hardcoding it.
export const HERO_ROTATION_COUNT = HERO_SEEDS.length;
