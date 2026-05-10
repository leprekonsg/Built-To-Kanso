import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { TemplateId } from "@/server/geometry/types";

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
    if (!isPng(png)) return null;
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
