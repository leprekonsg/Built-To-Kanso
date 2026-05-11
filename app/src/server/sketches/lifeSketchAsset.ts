import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { hashBytes } from "@/lib/imageHash";
import type { TemplateId } from "@/server/geometry/types";

const LIFE_SKETCH_TIER = "prototype_visualisation" as const;
// v5 (2026-05-11): deterministic bathroom-count gate added to the QA review.
// Prebakes baked under v4 may have a hallucinated extra bathroom because the
// VLM accepted candidates without counting fixtures — bump invalidates them.
const LIFE_SKETCH_INPUT_FINGERPRINT_VERSION = "topology-proof-v5-deterministic-bathroom-count" as const;

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
  anchorCachePath?: string;
  topologyProof?: string;
  inputFingerprintVersion?: typeof LIFE_SKETCH_INPUT_FINGERPRINT_VERSION;
  anchorHash?: string;
  topologyProofHash?: string;
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

async function readRelativeHash(cacheRoot: string, relativePath: string | undefined): Promise<string | undefined> {
  if (!relativePath || relativePath === "local-plan-sketch") return undefined;
  try {
    return hashBytes(await readFile(/*turbopackIgnore: true*/ join(cacheRoot, relativePath)));
  } catch {
    return undefined;
  }
}

async function acceptedInputFingerprintIsCurrent(
  cacheRoot: string,
  metadata: AcceptedLifeSketchMetadata,
): Promise<boolean> {
  if (metadata.inputFingerprintVersion !== LIFE_SKETCH_INPUT_FINGERPRINT_VERSION) return false;
  const [anchorHash, topologyProofHash] = await Promise.all([
    readRelativeHash(cacheRoot, metadata.anchorCachePath),
    readRelativeHash(cacheRoot, metadata.topologyProof),
  ]);
  return Boolean(
    metadata.anchorHash &&
      metadata.topologyProofHash &&
      anchorHash === metadata.anchorHash &&
      topologyProofHash === metadata.topologyProofHash,
  );
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
    if (!isPng(png)) return null;

    const metadata = JSON.parse(rawMetadata) as AcceptedLifeSketchMetadata;
    if (
      metadata.templateId !== templateId ||
      metadata.source !== "accepted_gpt_image_2_prebake" ||
      metadata.promptKind !== "life-sketch-from-anchor" ||
      metadata.candidateCount < 2 ||
      metadata.acceptedCandidateIndex < 0
    ) {
      return null;
    }
    if (!(await acceptedInputFingerprintIsCurrent(root, metadata))) return null;

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

export { LIFE_SKETCH_INPUT_FINGERPRINT_VERSION };

function isPng(bytes: Buffer): boolean {
  return bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
}
