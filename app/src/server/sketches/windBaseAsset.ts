// Wind Sketch Stage B (sumi-e styled top-down background, no streamlines) is
// cached on disk under public/wind-base/<templateId>/base.png. Stage C
// composes the deterministic LBM streamlines on top of this PNG at request
// time, so the bytes here must NOT contain streamlines, arrows, or labels.
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { TemplateId } from "@/server/geometry/types";
import { hashBytes, hashString } from "@/lib/imageHash";
import { isPngImage } from "@/lib/png";
import { getOpenAIImagePrompt } from "@/server/folio/prompts";
import { resolveCurrentPlanSketchArtifact, type PlanSketchArtifact } from "./planSketchAsset";

const WIND_BASE_TIER = "prototype_visualisation" as const;

function defaultWindBaseRoot(): string {
  return process.env.WIND_BASE_CACHE_ROOT
    ? resolve(/*turbopackIgnore: true*/ process.env.WIND_BASE_CACHE_ROOT)
    : resolve(/*turbopackIgnore: true*/ process.cwd(), "public");
}

export interface WindBaseCachePath {
  templateId: TemplateId;
  relativePath: string;
  absolutePath: string;
  metadataAbsolutePath: string;
  directory: string;
}

export interface WindBaseArtifact {
  source: "local-prebaked";
  contentType: "image/png";
  tier: typeof WIND_BASE_TIER;
  cachePath: string;
  absoluteCachePath: string;
  png: Buffer;
}

export function getWindBaseCachePath(
  templateId: TemplateId,
  cacheRoot: string = defaultWindBaseRoot(),
): WindBaseCachePath {
  const relativePath = join("wind-base", templateId, "base.png");
  const absolutePath = join(cacheRoot, relativePath);
  return {
    templateId,
    relativePath: relativePath.replaceAll("\\", "/"),
    absolutePath,
    metadataAbsolutePath: join(cacheRoot, "wind-base", templateId, "base.json"),
    directory: dirname(absolutePath),
  };
}

export async function resolveWindBaseArtifact(
  templateId: TemplateId,
  cacheRoot?: string,
): Promise<WindBaseArtifact | null> {
  const cache = getWindBaseCachePath(templateId, cacheRoot);
  try {
    const [png, raw, topology] = await Promise.all([
      readFile(/*turbopackIgnore: true*/ cache.absolutePath),
      readFile(/*turbopackIgnore: true*/ cache.metadataAbsolutePath, "utf8"),
      resolveCurrentPlanSketchArtifact(templateId, cacheRoot),
    ]);
    if (!topology || !validateWindBaseMetadata(templateId, topology, png, JSON.parse(raw))) return null;
    return {
      source: "local-prebaked",
      contentType: "image/png",
      tier: WIND_BASE_TIER,
      cachePath: cache.relativePath,
      absoluteCachePath: cache.absolutePath,
      png,
    };
  } catch {
    return null;
  }
}

export function buildWindBaseMetadata(templateId: TemplateId, topology: PlanSketchArtifact, png: Buffer, generationModel: string) {
  return {
    templateId,
    source: "wind_sketch_stage_b_prebake",
    promptKind: "wind-sketch-base",
    evidenceTier: WIND_BASE_TIER,
    sourceTruth: "plan-geometry.json",
    inputFingerprintVersion: "v2-current-topology",
    topologyProof: topology.cachePath,
    dependencyHashes: { topologyProofHash: hashBytes(topology.png) },
    pngHash: hashBytes(png),
    promptHash: hashString(getOpenAIImagePrompt("wind-sketch-base").prompt),
    generationModel,
    acceptedAtIso: new Date().toISOString(),
  };
}

export function validateWindBaseMetadata(templateId: TemplateId, topology: PlanSketchArtifact, png: Buffer, value: unknown): value is ReturnType<typeof buildWindBaseMetadata> {
  if (!isPngImage(png) || png.readUInt32BE(16) !== 1536 || png.readUInt32BE(20) !== 1024 || !value || typeof value !== "object") return false;
  const metadata = value as ReturnType<typeof buildWindBaseMetadata>;
  const expected = buildWindBaseMetadata(templateId, topology, png, metadata.generationModel);
  return metadata.templateId === expected.templateId && metadata.source === expected.source &&
    metadata.promptKind === expected.promptKind && metadata.evidenceTier === expected.evidenceTier &&
    metadata.sourceTruth === expected.sourceTruth && metadata.inputFingerprintVersion === expected.inputFingerprintVersion &&
    metadata.topologyProof === expected.topologyProof &&
    metadata.dependencyHashes?.topologyProofHash === expected.dependencyHashes.topologyProofHash &&
    metadata.pngHash === expected.pngHash && metadata.promptHash === expected.promptHash &&
    typeof metadata.generationModel === "string" && metadata.generationModel.length > 0 &&
    typeof metadata.acceptedAtIso === "string" && Number.isFinite(Date.parse(metadata.acceptedAtIso));
}
