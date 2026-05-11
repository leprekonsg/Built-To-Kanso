import { readFile } from "node:fs/promises";
import path from "node:path";

export type RenderAssetKind = "empty_room_hero" | "plan_sketch" | "life_anchor" | "life_reference";

export interface RenderAssetSpec {
  id: string;
  kind: RenderAssetKind;
  relativePath: string;
  minWidth: number;
  minHeight: number;
  minBytes: number;
  aspectMin?: number;
  aspectMax?: number;
}

export interface PngMetadata {
  width: number;
  height: number;
}

export interface RenderAssetResult extends RenderAssetSpec {
  ok: boolean;
  width: number | null;
  height: number | null;
  byteLength: number;
  issues: string[];
}

export interface RenderAssetValidationReport {
  ok: boolean;
  assetCount: number;
  failedCount: number;
  assets: RenderAssetResult[];
}

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const phase1Templates = ["resale-exec-1990s", "tampines-greenweave", "tengah-5room"] as const;

export function readPngMetadata(bytes: Uint8Array): PngMetadata {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);

  if (buffer.length < 24) {
    throw new Error("PNG is too small to contain a valid IHDR chunk.");
  }

  if (!buffer.subarray(0, pngSignature.length).equals(pngSignature)) {
    throw new Error("PNG signature is invalid.");
  }

  if (buffer.subarray(12, 16).toString("ascii") !== "IHDR") {
    throw new Error("PNG IHDR chunk is missing.");
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

export function expectedRenderAssets(): RenderAssetSpec[] {
  const heroAssets: RenderAssetSpec[] = Array.from({ length: 5 }, (_, index) => ({
    id: `empty-room-${index}`,
    kind: "empty_room_hero",
    relativePath: `hero/empty-room-${index}.png`,
    minWidth: 1200,
    minHeight: 700,
    minBytes: 500_000,
    aspectMin: 1.65,
    aspectMax: 1.9,
  }));

  const planAssets: RenderAssetSpec[] = phase1Templates.map((templateId) => ({
    id: `${templateId}-plan`,
    kind: "plan_sketch",
    relativePath: `plan-sketches/${templateId}/plan.png`,
    minWidth: 1000,
    minHeight: 800,
    minBytes: 20_000,
    aspectMin: 1,
    aspectMax: 1.35,
  }));

  const lifeAssets: RenderAssetSpec[] = phase1Templates.map((templateId) => ({
    id: `${templateId}-life-anchor`,
    kind: "life_anchor",
    relativePath: `life-anchors/${templateId}/anchor.png`,
    minWidth: 1500,
    minHeight: 1000,
    minBytes: 15_000,
    aspectMin: 1.45,
    aspectMax: 1.55,
  }));

  const referenceAssets: RenderAssetSpec[] = [
    {
      id: "brand-v3-poster-reference",
      kind: "life_reference",
      relativePath: "references/brand-v3-poster.png",
      minWidth: 1024,
      minHeight: 1024,
      minBytes: 100_000,
      aspectMin: 0.95,
      aspectMax: 1.05,
    },
    {
      id: "hdb-material-board-reference",
      kind: "life_reference",
      relativePath: "references/hdb-material-board.png",
      minWidth: 1024,
      minHeight: 1024,
      minBytes: 50_000,
      aspectMin: 0.95,
      aspectMax: 1.05,
    },
  ];

  return [...heroAssets, ...planAssets, ...lifeAssets, ...referenceAssets];
}

export function validateRenderAsset(spec: RenderAssetSpec, bytes: Uint8Array): RenderAssetResult {
  const issues: string[] = [];
  let metadata: PngMetadata | null = null;

  try {
    metadata = readPngMetadata(bytes);
  } catch (error) {
    issues.push(`${spec.relativePath}: ${(error as Error).message} Regenerate the local/prebaked asset.`);
  }

  if (bytes.byteLength < spec.minBytes) {
    issues.push(`${spec.relativePath}: expected at least ${spec.minBytes} bytes; found ${bytes.byteLength}.`);
  }

  if (metadata) {
    if (metadata.width < spec.minWidth) {
      issues.push(`${spec.relativePath}: expected width >= ${spec.minWidth}px; found ${metadata.width}px.`);
    }

    if (metadata.height < spec.minHeight) {
      issues.push(`${spec.relativePath}: expected height >= ${spec.minHeight}px; found ${metadata.height}px.`);
    }

    const aspect = metadata.width / metadata.height;
    if (spec.aspectMin !== undefined && aspect < spec.aspectMin) {
      issues.push(`${spec.relativePath}: expected aspect ratio >= ${spec.aspectMin}; found ${aspect.toFixed(3)}.`);
    }

    if (spec.aspectMax !== undefined && aspect > spec.aspectMax) {
      issues.push(`${spec.relativePath}: expected aspect ratio <= ${spec.aspectMax}; found ${aspect.toFixed(3)}.`);
    }
  }

  return {
    ...spec,
    ok: issues.length === 0,
    width: metadata?.width ?? null,
    height: metadata?.height ?? null,
    byteLength: bytes.byteLength,
    issues,
  };
}

export async function validateExpectedRenderAssets(
  publicRoot = path.join(process.cwd(), "public"),
): Promise<RenderAssetValidationReport> {
  const assets = await Promise.all(
    expectedRenderAssets().map(async (spec) => {
      try {
        const bytes = await readFile(path.join(publicRoot, spec.relativePath));
        return validateRenderAsset(spec, bytes);
      } catch (error) {
        const message = (error as NodeJS.ErrnoException).code === "ENOENT" ? "asset file is missing" : "asset file could not be read";
        return {
          ...spec,
          ok: false,
          width: null,
          height: null,
          byteLength: 0,
          issues: [`${spec.relativePath}: ${message}. Regenerate committed demo assets.`],
        };
      }
    }),
  );

  const failedCount = assets.filter((asset) => !asset.ok).length;
  return {
    ok: failedCount === 0,
    assetCount: assets.length,
    failedCount,
    assets,
  };
}
