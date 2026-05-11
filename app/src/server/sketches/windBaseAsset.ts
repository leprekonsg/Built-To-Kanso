// Wind Sketch Stage B (sumi-e styled top-down background, no streamlines) is
// cached on disk under public/wind-base/<templateId>/base.png. Stage C
// composes the deterministic LBM streamlines on top of this PNG at request
// time, so the bytes here must NOT contain streamlines, arrows, or labels.
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { TemplateId } from "@/server/geometry/types";

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
    directory: dirname(absolutePath),
  };
}

export async function resolveWindBaseArtifact(
  templateId: TemplateId,
  cacheRoot?: string,
): Promise<WindBaseArtifact | null> {
  const cache = getWindBaseCachePath(templateId, cacheRoot);
  try {
    const png = await readFile(/*turbopackIgnore: true*/ cache.absolutePath);
    if (!isPng(png)) return null;
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
