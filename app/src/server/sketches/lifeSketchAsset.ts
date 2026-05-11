import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { TemplateId } from "@/server/geometry/types";

const LIFE_SKETCH_TIER = "prototype_visualisation" as const;

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

export async function resolveAcceptedLifeSketchArtifact(
  templateId: TemplateId,
  cacheRoot?: string,
): Promise<AcceptedLifeSketchArtifact | null> {
  const cache = getAcceptedLifeSketchCachePath(templateId, cacheRoot);
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
