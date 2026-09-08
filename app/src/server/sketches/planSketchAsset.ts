import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { TemplateId } from "@/server/geometry/types";
import { getPlanGeometry } from "@/server/geometry/registry";
import { renderTopologyProofSvg } from "@/server/openai/fallbackSvg";
import { hashBytes, hashString } from "@/lib/imageHash";
import { isPngImage } from "@/lib/png";

const PLAN_SKETCH_TIER = "prototype_visualisation" as const;

function defaultPlanSketchRoot(): string {
  return process.env.PLAN_SKETCH_CACHE_ROOT
    ? resolve(/*turbopackIgnore: true*/ process.env.PLAN_SKETCH_CACHE_ROOT)
    : resolve(/*turbopackIgnore: true*/ process.cwd(), "public");
}

export interface PlanSketchCachePath {
  templateId: TemplateId;
  relativePath: string;
  absolutePath: string;
  metadataAbsolutePath: string;
  directory: string;
}

export interface PlanSketchArtifact {
  source: "local-prebaked";
  contentType: "image/png";
  tier: typeof PLAN_SKETCH_TIER;
  cachePath: string;
  absoluteCachePath: string;
  png: Buffer;
}

export interface PlanSketchCacheMetadata {
  schemaVersion: 1;
  templateId: TemplateId;
  sourceSvgHash: string;
  pngHash: string;
}

export function buildPlanSketchCacheMetadata(templateId: TemplateId, sourceSvg: string, png: Buffer): PlanSketchCacheMetadata {
  return { schemaVersion: 1, templateId, sourceSvgHash: hashString(sourceSvg), pngHash: hashBytes(png) };
}

export function getPlanSketchCachePath(
  templateId: TemplateId,
  cacheRoot: string = defaultPlanSketchRoot(),
): PlanSketchCachePath {
  const relativePath = join("plan-sketches", templateId, "plan.png");
  const absolutePath = join(cacheRoot, relativePath);
  return {
    templateId,
    relativePath: relativePath.replaceAll("\\", "/"),
    absolutePath,
    metadataAbsolutePath: join(cacheRoot, "plan-sketches", templateId, "plan.json"),
    directory: dirname(absolutePath),
  };
}

export async function resolvePlanSketchArtifact(
  templateId: TemplateId,
  cacheRoot?: string,
): Promise<PlanSketchArtifact | null> {
  const cache = getPlanSketchCachePath(templateId, cacheRoot);
  try {
    const png = await readFile(/*turbopackIgnore: true*/ cache.absolutePath);
    if (!isPngImage(png)) return null;
    return {
      source: "local-prebaked",
      contentType: "image/png",
      tier: PLAN_SKETCH_TIER,
      cachePath: cache.relativePath,
      absoluteCachePath: cache.absolutePath,
      png,
    };
  } catch {
    return null;
  }
}

// Image generation must never pair a current scene with an obsolete proof.
export async function resolveCurrentPlanSketchArtifact(templateId: TemplateId, cacheRoot?: string): Promise<PlanSketchArtifact | null> {
  const artifact = await resolvePlanSketchArtifact(templateId, cacheRoot);
  if (!artifact) return null;
  const cache = getPlanSketchCachePath(templateId, cacheRoot);
  try {
    const metadata: unknown = JSON.parse(await readFile(/*turbopackIgnore: true*/ cache.metadataAbsolutePath, "utf8"));
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    const expected = buildPlanSketchCacheMetadata(templateId, renderTopologyProofSvg(getPlanGeometry(templateId)), artifact.png);
    const recorded = metadata as Partial<PlanSketchCacheMetadata>;
    return recorded.schemaVersion === expected.schemaVersion && recorded.templateId === expected.templateId &&
      recorded.sourceSvgHash === expected.sourceSvgHash && recorded.pngHash === expected.pngHash ? artifact : null;
  } catch {
    return null;
  }
}
