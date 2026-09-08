import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { hashBytes, hashString } from "@/lib/imageHash";
import { getOpenAIImagePrompt } from "@/server/folio/prompts";
import type { TemplateId } from "@/server/geometry/types";
import { isPngImage } from "@/lib/png";
import { resolveAcceptedLifeSketchArtifact, type AcceptedLifeSketchArtifact } from "./lifeSketchAsset";

export const RESONANCE_HOUR_INPUT_VERSION = "v2-accepted-life-provenance";

export interface ResonanceHourMetadata {
  templateId: TemplateId;
  source: "resonance_hour_prebake";
  promptKind: "resonance-hour-background";
  evidenceTier: "prototype_visualisation";
  sourceTruth: "plan-geometry.json";
  inputFingerprintVersion: typeof RESONANCE_HOUR_INPUT_VERSION;
  generationModel: string;
  acceptedAtIso: string;
  sourceLifeSketch: string;
  dependencyHashes: { acceptedLifeSketchHash: string };
  promptHash: string;
  pngHash: string;
}

export function getResonanceHourCachePath(templateId: TemplateId, cacheRoot?: string) {
  const root = cacheRoot ?? resolve(/*turbopackIgnore: true*/ process.env.RESONANCE_HOUR_CACHE_ROOT ?? join(process.cwd(), "public"));
  const relativePath = `resonance-hour/${templateId}/accepted.png`;
  const metadataRelativePath = `resonance-hour/${templateId}/accepted.json`;
  return { relativePath, metadataRelativePath, absolutePath: join(root, relativePath), metadataAbsolutePath: join(root, metadataRelativePath) };
}

export function resonanceHourMetadata(
  source: AcceptedLifeSketchArtifact,
  png: Buffer,
  generationModel: string,
): ResonanceHourMetadata {
  return {
    templateId: source.metadata.templateId,
    source: "resonance_hour_prebake",
    promptKind: "resonance-hour-background",
    evidenceTier: "prototype_visualisation",
    sourceTruth: "plan-geometry.json",
    inputFingerprintVersion: RESONANCE_HOUR_INPUT_VERSION,
    generationModel,
    acceptedAtIso: new Date().toISOString(),
    sourceLifeSketch: source.cachePath,
    dependencyHashes: { acceptedLifeSketchHash: hashBytes(source.png) },
    promptHash: hashString(getOpenAIImagePrompt("resonance-hour-background").prompt),
    pngHash: hashBytes(png),
  };
}

export function validateResonanceHourMetadata(
  source: AcceptedLifeSketchArtifact,
  png: Buffer,
  value: unknown,
): value is ResonanceHourMetadata {
  if (!value || typeof value !== "object") return false;
  const metadata = value as ResonanceHourMetadata;
  const expected = resonanceHourMetadata(source, png, metadata.generationModel);
  return isPngImage(png) &&
    metadata.templateId === expected.templateId && metadata.source === expected.source &&
    metadata.promptKind === expected.promptKind && metadata.evidenceTier === expected.evidenceTier &&
    metadata.sourceTruth === expected.sourceTruth && metadata.inputFingerprintVersion === expected.inputFingerprintVersion &&
    metadata.sourceLifeSketch === expected.sourceLifeSketch &&
    metadata.dependencyHashes?.acceptedLifeSketchHash === expected.dependencyHashes.acceptedLifeSketchHash &&
    metadata.promptHash === expected.promptHash && metadata.pngHash === expected.pngHash &&
    typeof metadata.generationModel === "string" && metadata.generationModel.length > 0 &&
    typeof metadata.acceptedAtIso === "string" && Number.isFinite(Date.parse(metadata.acceptedAtIso));
}

export async function resolveResonanceHourArtifact(
  templateId: TemplateId,
  cacheRoot?: string,
  source?: AcceptedLifeSketchArtifact,
) {
  const accepted = source ?? await resolveAcceptedLifeSketchArtifact(templateId, cacheRoot);
  if (!accepted || accepted.metadata.templateId !== templateId) return null;
  const cache = getResonanceHourCachePath(templateId, cacheRoot);
  try {
    const [png, raw] = await Promise.all([
      readFile(/*turbopackIgnore: true*/ cache.absolutePath),
      readFile(/*turbopackIgnore: true*/ cache.metadataAbsolutePath, "utf8"),
    ]);
    const metadata: unknown = JSON.parse(raw);
    if (!validateResonanceHourMetadata(accepted, png, metadata)) return null;
    return { ...cache, png, metadata };
  } catch {
    return null;
  }
}
