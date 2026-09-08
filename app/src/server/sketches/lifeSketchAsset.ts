import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { hashBytes, hashString } from "@/lib/imageHash";
import { buildLifeAnchorSceneManifest, getLifeAnchorCachePath, lifeAnchorManifestHash } from "@/server/anchors/lifeAnchor";
import { getOpenAIImagePrompt } from "@/server/folio/prompts";
import { getPlanGeometry } from "@/server/geometry/registry";
import type { TemplateId } from "@/server/geometry/types";
import { LIFE_SKETCH_QA_GATE_VERSION, validateLifeSketchReview, type LifeSketchCandidateReview } from "@/server/openai/lifeSketchReview";
import { isPngImage } from "@/lib/png";
import type { LifeSketchReferenceBundle } from "@/server/openai/sketches";
import { getPlanSketchCachePath, resolveCurrentPlanSketchArtifact } from "./planSketchAsset";

const LIFE_SKETCH_TIER = "prototype_visualisation" as const;
const LIFE_SKETCH_INPUT_FINGERPRINT_VERSION = "v6-complete-input-provenance" as const;

function defaultLifeSketchRoot(): string {
  return process.env.LIFE_SKETCH_CACHE_ROOT
    ? resolve(/*turbopackIgnore: true*/ process.env.LIFE_SKETCH_CACHE_ROOT)
    : resolve(/*turbopackIgnore: true*/ process.cwd(), "public");
}

export interface AcceptedLifeSketchCachePath {
  templateId: TemplateId;
  relativePath: string;
  metadataRelativePath: string;
  absolutePath: string;
  metadataAbsolutePath: string;
  directory: string;
}

export interface AcceptedLifeSketchMetadata {
  templateId: TemplateId;
  source: "accepted_gpt_image_2_prebake";
  promptKind: "life-sketch-from-anchor";
  candidateCount: number;
  acceptedCandidateIndex: number;
  rejectedCandidates: Array<{ candidateIndex: number; reason: string }>;
  acceptedAtIso: string;
  reviewerModel?: string;
  reviewerSummary?: string;
  cacheKey?: string;
  evidenceTier?: typeof LIFE_SKETCH_TIER;
  sourceTruth?: "plan-geometry.json";
  qaGateVersion?: string;
  generationModel?: string;
  anchorCachePath?: string;
  topologyProof?: string;
  inputFingerprintVersion?: typeof LIFE_SKETCH_INPUT_FINGERPRINT_VERSION;
  anchorHash?: string;
  topologyProofHash?: string;
  manifestHash?: string;
  promptHash?: string;
  brandHash?: string;
  materialHash?: string;
  pngHash?: string;
  candidateReviews?: LifeSketchCandidateReview[];
}

export interface AcceptedLifeSketchArtifact {
  source: "accepted-gpt-image-2-prebake";
  contentType: "image/png";
  tier: typeof LIFE_SKETCH_TIER;
  cachePath: string;
  absoluteCachePath: string;
  metadataPath: string;
  metadata: AcceptedLifeSketchMetadata;
  png: Buffer;
}

export function getAcceptedLifeSketchCachePath(
  templateId: TemplateId,
  cacheRoot: string = defaultLifeSketchRoot(),
): AcceptedLifeSketchCachePath {
  const relativePath = join("life-sketches", templateId, "accepted.png");
  const metadataRelativePath = join("life-sketches", templateId, "accepted.json");
  const absolutePath = join(cacheRoot, relativePath);
  const metadataAbsolutePath = join(cacheRoot, metadataRelativePath);
  return {
    templateId,
    relativePath: relativePath.replaceAll("\\", "/"),
    metadataRelativePath: metadataRelativePath.replaceAll("\\", "/"),
    absolutePath,
    metadataAbsolutePath,
    directory: dirname(absolutePath),
  };
}

async function readOptionalFile(absolutePath: string): Promise<Buffer | undefined> {
  try {
    return await readFile(/*turbopackIgnore: true*/ absolutePath);
  } catch {
    return undefined;
  }
}

export async function loadLifeSketchStyleReferences(
  cacheRoot = resolve(/*turbopackIgnore: true*/ process.cwd(), "public"),
): Promise<LifeSketchReferenceBundle> {
  const [brand, material] = await Promise.all([
    readOptionalFile(join(cacheRoot, "references", "brand-v3-poster.png")),
    readOptionalFile(join(cacheRoot, "references", "hdb-material-board.png"))
      .then(async (bytes) => bytes ?? readOptionalFile(join(cacheRoot, "references", "japandi-material-board.png"))),
  ]);
  return { ...(brand ? { brand } : {}), ...(material ? { material } : {}) };
}

export function lifeSketchInputFingerprint(
  templateId: TemplateId,
  anchor: Buffer,
  references: LifeSketchReferenceBundle,
) {
  const material = references.material ?? references.japandi;
  return {
    inputFingerprintVersion: LIFE_SKETCH_INPUT_FINGERPRINT_VERSION,
    qaGateVersion: LIFE_SKETCH_QA_GATE_VERSION,
    anchorHash: hashBytes(anchor),
    topologyProofHash: references.topologyProof ? hashBytes(references.topologyProof) : "missing",
    manifestHash: lifeAnchorManifestHash(buildLifeAnchorSceneManifest(getPlanGeometry(templateId))),
    promptHash: hashString(getOpenAIImagePrompt("life-sketch-from-anchor").prompt),
    brandHash: references.brand ? hashBytes(references.brand) : "missing",
    materialHash: material ? hashBytes(material) : "missing",
  };
}

async function acceptedInputFingerprintIsCurrent(
  cacheRoot: string | undefined,
  metadata: AcceptedLifeSketchMetadata,
): Promise<boolean> {
  if (metadata.inputFingerprintVersion !== LIFE_SKETCH_INPUT_FINGERPRINT_VERSION) return false;
  if (metadata.qaGateVersion !== LIFE_SKETCH_QA_GATE_VERSION) return false;
  const anchorPath = getLifeAnchorCachePath(metadata.templateId, cacheRoot);
  const topologyPath = getPlanSketchCachePath(metadata.templateId, cacheRoot);
  if (metadata.anchorCachePath !== anchorPath.relativePath || metadata.topologyProof !== topologyPath.relativePath) return false;
  const [anchor, topologyProof, style] = await Promise.all([
    readOptionalFile(anchorPath.absolutePath),
    resolveCurrentPlanSketchArtifact(metadata.templateId, cacheRoot).then((artifact) => artifact?.png),
    loadLifeSketchStyleReferences(cacheRoot),
  ]);
  if (!anchor || !topologyProof) return false;
  const current = lifeSketchInputFingerprint(metadata.templateId, anchor, { ...style, topologyProof });
  return Object.entries(current).every(([key, value]) => metadata[key as keyof AcceptedLifeSketchMetadata] === value);
}

export async function resolveAcceptedLifeSketchArtifact(
  templateId: TemplateId,
  cacheRoot?: string,
): Promise<AcceptedLifeSketchArtifact | null> {
  const root = cacheRoot ?? defaultLifeSketchRoot();
  const cache = getAcceptedLifeSketchCachePath(templateId, root);
  try {
    const [png, rawMetadata] = await Promise.all([
      readFile(/*turbopackIgnore: true*/ cache.absolutePath),
      readFile(/*turbopackIgnore: true*/ cache.metadataAbsolutePath, "utf8"),
    ]);
    const metadata = await validateAcceptedLifeSketchMetadata(templateId, png, JSON.parse(rawMetadata), cacheRoot);
    if (!metadata) return null;

    return {
      source: "accepted-gpt-image-2-prebake",
      contentType: "image/png",
      tier: LIFE_SKETCH_TIER,
      cachePath: cache.relativePath,
      absoluteCachePath: cache.absolutePath,
      metadataPath: cache.metadataRelativePath,
      metadata,
      png,
    };
  } catch {
    return null;
  }
}

export async function validateAcceptedLifeSketchMetadata(
  templateId: TemplateId,
  png: Buffer,
  value: unknown,
  cacheRoot?: string,
): Promise<AcceptedLifeSketchMetadata | null> {
  if (!isPngImage(png) || !value || typeof value !== "object") return null;
  const plan = getPlanGeometry(templateId);
  if (buildLifeAnchorSceneManifest(plan).metadata.geometryIssues.length > 0) return null;
  const metadata = value as AcceptedLifeSketchMetadata;
  if (
    metadata.templateId !== templateId ||
    metadata.source !== "accepted_gpt_image_2_prebake" ||
    metadata.promptKind !== "life-sketch-from-anchor" ||
    !Number.isInteger(metadata.candidateCount) || metadata.candidateCount < 2 || metadata.candidateCount > 3 ||
    !Number.isInteger(metadata.acceptedCandidateIndex) || metadata.acceptedCandidateIndex < 0 ||
    metadata.acceptedCandidateIndex >= metadata.candidateCount ||
    !Array.isArray(metadata.rejectedCandidates) ||
    metadata.evidenceTier !== LIFE_SKETCH_TIER ||
    metadata.sourceTruth !== "plan-geometry.json" ||
    typeof metadata.generationModel !== "string" || !metadata.generationModel ||
    typeof metadata.reviewerModel !== "string" || !metadata.reviewerModel ||
    typeof metadata.acceptedAtIso !== "string" || !Number.isFinite(Date.parse(metadata.acceptedAtIso)) ||
    metadata.pngHash !== hashBytes(png)
  ) return null;
  const review = validateLifeSketchReview({
    acceptedCandidateIndex: metadata.acceptedCandidateIndex,
    candidateReviews: metadata.candidateReviews,
    summary: metadata.reviewerSummary,
  }, metadata.candidateCount, plan.rooms.filter((room) => room.kind === "bathroom").length);
  if (!review.ok) return null;
  const rejectedIndices = new Set<number>();
  for (const rejected of metadata.rejectedCandidates) {
    if (!rejected || !Number.isInteger(rejected.candidateIndex) || rejected.candidateIndex < 0 ||
        rejected.candidateIndex >= metadata.candidateCount || rejected.candidateIndex === metadata.acceptedCandidateIndex ||
        rejectedIndices.has(rejected.candidateIndex) || typeof rejected.reason !== "string" || !rejected.reason) return null;
    rejectedIndices.add(rejected.candidateIndex);
  }
  return await acceptedInputFingerprintIsCurrent(cacheRoot, metadata) ? metadata : null;
}

export { LIFE_SKETCH_INPUT_FINGERPRINT_VERSION };
