// Sketch generators for Plan Sketch, Life Sketch, and Empty Room hero.
// All three are tier "prototype_visualisation" (evidence.ts).
//
// Cache is checked first. On a true miss with no API key, we return a typed
// failure so the route layer can surface a calm degradation message instead
// of failing open.

import { hashBytes } from "@/lib/imageHash";
import { getOpenAIImagePrompt, type ImagePromptKind } from "@/server/folio/prompts";
import { callOpenAIImage } from "./client";
import { getCached, keyFor, putCached } from "./cache";

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
    | "openai_error"
    | "openai_unreachable";
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

async function runOrCache(
  promptId: ImagePromptKind,
  inputs: { imageHashes?: string[]; seed?: string },
  buildRequest: () => Parameters<typeof callOpenAIImage>[0],
): Promise<SketchResult> {
  const key = keyFor(promptId, inputs);
  // server-cache-react: route handlers are not RSC, so we use the disk cache
  // directly here. RSC callers should wrap their lookups with React.cache.
  const cached = await getCached(key);
  if (cached) {
    return { ok: true, png: cached, fromCache: true, tier: SKETCH_TIER, promptId };
  }

  if (!process.env.OPENAI_API_KEY) {
    return { ok: false, reason: "no_cached_no_key", promptId };
  }

  const result = await callOpenAIImage(buildRequest());
  if (!result.ok) {
    return { ok: false, reason: result.reason === "missing_api_key" ? "no_cached_no_key" : result.reason, promptId, detail: result.detail };
  }

  await putCached(key, result.png);
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

export async function generateLifeSketch(anchorPng: Buffer): Promise<SketchResult> {
  const spec = getOpenAIImagePrompt("life-sketch-from-anchor");
  const imageHash = hashBytes(anchorPng);
  return runOrCache(
    spec.kind,
    { imageHashes: [imageHash] },
    () => ({ mode: "edit", promptId: spec.kind, prompt: spec.prompt, image: anchorPng }),
  );
}

export type HeroRotationIndex = 0 | 1 | 2 | 3 | 4;

export async function generateEmptyRoomHero(rotationIndex: HeroRotationIndex): Promise<SketchResult> {
  const spec = getOpenAIImagePrompt("empty-room-hero");
  const seed = HERO_SEEDS[rotationIndex];
  return runOrCache(
    spec.kind,
    { seed },
    () => ({ mode: "generate", promptId: spec.kind, prompt: spec.prompt, seed }),
  );
}

// Exposed so prebake script and route handlers can reason about the
// rotation cardinality without hardcoding it.
export const HERO_ROTATION_COUNT = HERO_SEEDS.length;
