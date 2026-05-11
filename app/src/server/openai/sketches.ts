// Sketch generators for Plan Sketch, Life Sketch, and Empty Room hero.
// All three are tier "prototype_visualisation" (evidence.ts).
//
// Cache is checked first. On a true miss with no API key, we return a typed
// failure so the route layer can surface a calm degradation message instead
// of failing open.

import { hashBytes, hashString } from "@/lib/imageHash";
import { getOpenAIImagePrompt, type ImagePromptKind } from "@/server/folio/prompts";
import { callOpenAIImage, getOpenAIImageConfig, getOpenAIImageModel } from "./client";
import {
  LIFE_SKETCH_QA_GATE_VERSION,
  reviewLifeSketchCandidates,
  type LifeSketchCandidateReview,
} from "./lifeSketchReview";
import {
  getCachedMetadata,
  getConfiguredSketchCache,
  keyFor,
  putCachedMetadata,
  type SketchCacheMetadata,
} from "./cache";

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
  candidateCount?: number;
  acceptedCandidateIndex?: number;
  qa?: LifeSketchQaReport;
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

export interface LifeSketchQaCheck {
  id: string;
  ok: boolean;
  evidence: string;
}

export interface LifeSketchQaReport {
  status: "accepted" | "accepted_from_cache";
  method: "responses_candidate_review";
  candidateCount: number;
  acceptedCandidateIndex: number;
  checks: LifeSketchQaCheck[];
  rejectedCandidates: Array<{ candidateIndex: number; reason: string }>;
  reviewerModel?: string;
  reviewerSummary?: string;
  candidateReviews?: LifeSketchCandidateReview[];
  limitation: string;
}

const LIFE_SKETCH_CANDIDATE_COUNT = 3;
const LIFE_SKETCH_QA_LIMITATION =
  "Responses candidate QA screens rendered pixels for topology drift. plan-geometry.json remains compliance truth; permanent prebakes still require Designer proof inspection.";

// Five sealed seeds for the empty-room hero rotation. Hand-picked words —
// not generated — so the rotation order is reproducible across machines.
const HERO_SEEDS: readonly [string, string, string, string, string] = [
  "kanso-empty-bone",
  "kanso-empty-balcony",
  "kanso-empty-amber",
  "kanso-empty-sage",
  "kanso-empty-hush",
];

export const EMPTY_ROOM_HERO_VARIANT_CUES: readonly [string, string, string, string, string] = [
  "Variant cue: morning east light through north-east monsoon softness, balcony light, empty threshold.",
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
  const model = getOpenAIImageModel();
  const request = buildRequest();
  const key = keyFor(promptId, { ...inputs, model, promptHash: hashString(request.prompt) });
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

  const result = await callOpenAIImage(request);
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
  topologyProof?: Buffer;
  brand?: Buffer;
  material?: Buffer;
  /** Backward-compatible alias while local reference filenames migrate. */
  japandi?: Buffer;
}

export interface LifeSketchReviewContext {
  manifestSummary?: string;
  // Authoritative bathroom count from plan-geometry.json. The QA gate
  // requires this so it can reject candidates that hallucinate fixtures.
  lockedBathroomCount?: number;
}

export async function generateLifeSketch(
  anchorPng: Buffer,
  references: LifeSketchReferenceBundle = {},
  reviewContext: LifeSketchReviewContext = {},
): Promise<SketchResult> {
  const spec = getOpenAIImagePrompt("life-sketch-from-anchor");
  const materialReference = references.material ?? references.japandi;
  const referenceImages = [references.topologyProof, references.brand, materialReference].filter(
    (buf): buf is Buffer => Buffer.isBuffer(buf),
  );
  const imageHashes = [hashBytes(anchorPng), ...referenceImages.map((buf) => hashBytes(buf))];
  const model = getOpenAIImageModel();
  const request = {
    mode: "edit" as const,
    promptId: spec.kind,
    prompt: spec.prompt,
    image: anchorPng,
    ...(referenceImages.length > 0 ? { referenceImages } : {}),
    n: LIFE_SKETCH_CANDIDATE_COUNT,
    size: "1536x1024",
  };
  const key = keyFor(spec.kind, {
    imageHashes,
    model,
    promptHash: hashString(request.prompt),
    qaGateVersion: LIFE_SKETCH_QA_GATE_VERSION,
  });
  const cacheResult = getConfiguredSketchCache();
  if (!cacheResult.ok) {
    return { ok: false, reason: cacheResult.reason, promptId: spec.kind, detail: cacheResult.message };
  }

  const cached = await cacheResult.cache.get(key);
  if (cached) {
    const metadata = await getCachedMetadata(key);
    if (metadata) {
      const qa = qaFromMetadata(metadata, referenceImages.length);
      return {
        ok: true,
        png: cached,
        fromCache: true,
        tier: SKETCH_TIER,
        promptId: spec.kind,
        candidateCount: qa.candidateCount,
        acceptedCandidateIndex: qa.acceptedCandidateIndex,
        qa,
      };
    }
  }

  const config = getOpenAIImageConfig();
  if (!config.ok) {
    return { ok: false, reason: "no_cached_no_key", promptId: spec.kind, detail: config.message };
  }

  const result = await callOpenAIImage(request);
  if (!result.ok) {
    return { ok: false, reason: result.reason === "missing_api_key" ? "no_cached_no_key" : result.reason, promptId: spec.kind, detail: result.detail };
  }

  const review = await reviewLifeSketchCandidates({
    anchorPng,
    topologyProof: references.topologyProof,
    candidates: result.candidates,
    manifestSummary: reviewContext.manifestSummary,
    lockedBathroomCount: reviewContext.lockedBathroomCount,
  });
  if (!review.ok) {
    const reason = review.reason === "openai_timeout"
      ? "openai_timeout"
      : review.reason === "openai_unreachable"
        ? "openai_unreachable"
        : "openai_error";
    return {
      ok: false,
      reason,
      promptId: spec.kind,
      detail: `life_sketch_candidate_qa_${review.reason}: ${review.detail}`,
    };
  }

  const candidateCount = result.candidates.length;
  const acceptedCandidateIndex = review.acceptedCandidateIndex;
  const qa = buildLifeSketchQaReport({
    candidateCount,
    acceptedCandidateIndex,
    hasTopologyProof: Boolean(references.topologyProof),
    hasBrandReference: Boolean(references.brand),
    hasMaterialReference: Boolean(materialReference),
    fromCache: false,
    candidateReviews: review.candidateReviews,
    reviewerModel: review.model,
    reviewerSummary: review.summary,
  });
  const metadata: SketchCacheMetadata = {
    key,
    promptKind: spec.kind,
    candidateCount,
    acceptedCandidateIndex,
    rejectedCandidates: qa.rejectedCandidates,
    acceptedAtIso: new Date().toISOString(),
    reviewerModel: review.model,
    reviewerSummary: review.summary,
    candidateReviews: review.candidateReviews,
  };
  await cacheResult.cache.put(key, result.candidates[acceptedCandidateIndex] ?? result.png);
  await putCachedMetadata(metadata);

  return {
    ok: true,
    png: result.candidates[acceptedCandidateIndex] ?? result.png,
    fromCache: false,
    tier: SKETCH_TIER,
    promptId: spec.kind,
    candidateCount,
    acceptedCandidateIndex,
    qa,
  };
}

function qaFromMetadata(metadata: SketchCacheMetadata, referenceCount: number): LifeSketchQaReport {
  return {
    status: "accepted_from_cache",
    method: "responses_candidate_review",
    candidateCount: metadata.candidateCount,
    acceptedCandidateIndex: metadata.acceptedCandidateIndex,
    rejectedCandidates: metadata.rejectedCandidates,
    reviewerModel: metadata.reviewerModel,
    reviewerSummary: metadata.reviewerSummary,
    candidateReviews: metadata.candidateReviews as LifeSketchCandidateReview[] | undefined,
    checks: [
      { id: "accepted_cache_entry", ok: true, evidence: metadata.acceptedAtIso },
      { id: "reference_images", ok: referenceCount >= 3, evidence: `${referenceCount} reference image(s) in cache key.` },
      {
        id: "responses_candidate_review",
        ok: Boolean(metadata.reviewerModel && metadata.candidateReviews?.length),
        evidence: metadata.reviewerSummary ?? "Candidate review metadata missing.",
      },
    ],
    limitation: LIFE_SKETCH_QA_LIMITATION,
  };
}

function buildLifeSketchQaReport(input: {
  candidateCount: number;
  acceptedCandidateIndex: number;
  hasTopologyProof: boolean;
  hasBrandReference: boolean;
  hasMaterialReference: boolean;
  fromCache: boolean;
  candidateReviews?: LifeSketchCandidateReview[];
  reviewerModel?: string;
  reviewerSummary?: string;
}): LifeSketchQaReport {
  const rejectedCandidates = input.candidateReviews
    ? input.candidateReviews
        .filter((candidate) => candidate.candidateIndex !== input.acceptedCandidateIndex)
        .map((candidate) => ({
          candidateIndex: candidate.candidateIndex,
          reason: candidate.reasons[0] ?? "structural_qa_rejected",
        }))
    : Array.from({ length: input.candidateCount }, (_, candidateIndex) => candidateIndex)
        .filter((candidateIndex) => candidateIndex !== input.acceptedCandidateIndex)
        .map((candidateIndex) => ({
          candidateIndex,
          reason: "not_selected_after_responses_candidate_review",
        }));

  return {
    status: input.fromCache ? "accepted_from_cache" : "accepted",
    method: "responses_candidate_review",
    candidateCount: input.candidateCount,
    acceptedCandidateIndex: input.acceptedCandidateIndex,
    rejectedCandidates,
    reviewerModel: input.reviewerModel,
    reviewerSummary: input.reviewerSummary,
    candidateReviews: input.candidateReviews,
    checks: [
      {
        id: "image_1_camera_locked",
        ok: true,
        evidence: "Image 1 is the deterministic camera-view greybox anchor.",
      },
      {
        id: "image_2_topology_proof",
        ok: input.hasTopologyProof,
        evidence: input.hasTopologyProof
          ? "Image 2 is the top-down plan proof from locked plan-geometry.json."
          : "Topology proof missing; route should provide plan-sketches/<templateId>/plan.png before materialization.",
      },
      {
        id: "style_references",
        ok: input.hasBrandReference && input.hasMaterialReference,
        evidence: `${input.hasBrandReference ? "brand" : "no-brand"}, ${input.hasMaterialReference ? "material" : "no-material"}`,
      },
      {
        id: "candidate_batch",
        ok: input.candidateCount >= 2 && input.candidateCount <= 3,
        evidence: `${input.candidateCount} candidate image(s) returned; accepted candidate ${input.acceptedCandidateIndex}.`,
      },
      {
        id: "responses_candidate_review",
        ok: Boolean(input.reviewerModel && input.candidateReviews?.length),
        evidence: input.reviewerSummary ?? "Candidate review metadata missing.",
      },
    ],
    limitation: LIFE_SKETCH_QA_LIMITATION,
  };
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

// Stage B of the brief's Wind Sketch pipeline. Produces a styled sumi-e top-
// down background from a locked-plan rasterization. Stage C will composite
// the deterministic LBM streamlines on top of this PNG, so this image must
// not contain streamlines, arrows, or furniture itself.
export async function generateWindSketchBase(lockedPlanRasterPng: Buffer): Promise<SketchResult> {
  const spec = getOpenAIImagePrompt("wind-sketch-base");
  const imageHash = hashBytes(lockedPlanRasterPng);
  return runOrCache(
    spec.kind,
    { imageHashes: [imageHash] },
    () => ({ mode: "edit", promptId: spec.kind, prompt: spec.prompt, image: lockedPlanRasterPng }),
  );
}

// Resonance Hour still: the brief's closing image (Section 20). Takes the
// polished Life Sketch as a 3D base and renders the moment "real evening
// wind has just arrived" — sheer curtain barely lifts, dust motes in balcony
// light, leaves tilt subtly. Wind is implied through environmental cues, NOT
// arrows or streamlines. This is the user's home seen at 18:42 on a Tuesday;
// the Wind Sketch top-down remains airflow source of truth.
export async function generateResonanceHour(lifeSketchPng: Buffer): Promise<SketchResult> {
  const spec = getOpenAIImagePrompt("resonance-hour-background");
  const imageHash = hashBytes(lifeSketchPng);
  return runOrCache(
    spec.kind,
    { imageHashes: [imageHash] },
    () => ({ mode: "edit", promptId: spec.kind, prompt: spec.prompt, image: lifeSketchPng }),
  );
}

export type HeroRotationIndex = 0 | 1 | 2 | 3 | 4;

export async function generateEmptyRoomHero(rotationIndex: HeroRotationIndex): Promise<SketchResult> {
  const spec = getOpenAIImagePrompt("empty-room-hero");
  const seed = HERO_SEEDS[rotationIndex];
  const prompt = [spec.prompt, EMPTY_ROOM_HERO_VARIANT_CUES[rotationIndex]].join("\n");
  return runOrCache(
    spec.kind,
    { seed },
    () => ({ mode: "generate", promptId: spec.kind, prompt }),
  );
}

// Exposed so prebake script and route handlers can reason about the
// rotation cardinality without hardcoding it.
export const HERO_ROTATION_COUNT = HERO_SEEDS.length;
