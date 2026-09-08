import { readFile } from "node:fs/promises";
import path from "node:path";
import { hashBytes } from "../../lib/imageHash";
import { LIFE_SKETCH_QA_GATE_VERSION } from "../openai/lifeSketchReview";
import { isTemplateId } from "../geometry/registry";
import { LIFE_SKETCH_INPUT_FINGERPRINT_VERSION, resolveAcceptedLifeSketchArtifact } from "../sketches/lifeSketchAsset";
import { RESONANCE_HOUR_INPUT_VERSION, resolveResonanceHourArtifact } from "../sketches/resonanceHourAsset";
import { resolveWindBaseArtifact } from "../sketches/windBaseAsset";

export type RenderAssetKind =
  | "empty_room_hero"
  | "plan_sketch"
  | "life_anchor"
  | "accepted_life_sketch"
  | "wind_base"
  | "resonance_hour"
  | "life_reference";

export type RenderAssetScope =
  | "phase1_all_templates"
  | "phase1_demo_flagship"
  | "phase1_shared_reference";

export interface RenderAssetDependencyHashSpec {
  relativePath: string;
  metadataPath: string;
}

export interface RenderAssetSpec {
  id: string;
  kind: RenderAssetKind;
  relativePath: string;
  scope: RenderAssetScope;
  templateId?: string;
  metadataRelativePath?: string;
  requiredMetadata?: Record<string, string | number | boolean>;
  dependencyHashes?: RenderAssetDependencyHashSpec[];
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
  metadataOk: boolean | null;
  issues: string[];
}

export interface TemplateRenderAssetSummary {
  templateId: string;
  assetCount: number;
  failedCount: number;
  assets: RenderAssetResult[];
}

export interface RenderAssetValidationReport {
  ok: boolean;
  assetCount: number;
  failedCount: number;
  assets: RenderAssetResult[];
  byTemplate: TemplateRenderAssetSummary[];
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
    scope: "phase1_shared_reference",
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
    scope: "phase1_all_templates",
    templateId,
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
    scope: "phase1_all_templates",
    templateId,
    relativePath: `life-anchors/${templateId}/anchor.png`,
    minWidth: 1500,
    minHeight: 1000,
    minBytes: 15_000,
    aspectMin: 1.45,
    aspectMax: 1.55,
  }));

  const acceptedLifeSketchAssets: RenderAssetSpec[] = phase1Templates.map((templateId) => ({
    id: `${templateId}-accepted-life-sketch`,
    kind: "accepted_life_sketch",
    scope: "phase1_all_templates",
    templateId,
    relativePath: `life-sketches/${templateId}/accepted.png`,
    metadataRelativePath: `life-sketches/${templateId}/accepted.json`,
    requiredMetadata: {
      templateId,
      source: "accepted_gpt_image_2_prebake",
      promptKind: "life-sketch-from-anchor",
      evidenceTier: "prototype_visualisation",
      sourceTruth: "plan-geometry.json",
      qaGateVersion: LIFE_SKETCH_QA_GATE_VERSION,
      inputFingerprintVersion: LIFE_SKETCH_INPUT_FINGERPRINT_VERSION,
    },
    dependencyHashes: [
      {
        relativePath: `life-anchors/${templateId}/anchor.png`,
        metadataPath: "anchorHash",
      },
      {
        relativePath: `plan-sketches/${templateId}/plan.png`,
        metadataPath: "topologyProofHash",
      },
    ],
    minWidth: 1500,
    minHeight: 1000,
    minBytes: 500_000,
    aspectMin: 1.45,
    aspectMax: 1.55,
  }));

  const flagshipGeneratedAssets: RenderAssetSpec[] = [
    {
      id: "tampines-greenweave-wind-base",
      kind: "wind_base",
      scope: "phase1_demo_flagship",
      templateId: "tampines-greenweave",
      relativePath: "wind-base/tampines-greenweave/base.png",
      metadataRelativePath: "wind-base/tampines-greenweave/base.json",
      requiredMetadata: {
        templateId: "tampines-greenweave",
        source: "wind_sketch_stage_b_prebake",
        promptKind: "wind-sketch-base",
        evidenceTier: "prototype_visualisation",
        sourceTruth: "plan-geometry.json",
        inputFingerprintVersion: "v2-current-topology",
      },
      dependencyHashes: [
        {
          relativePath: "plan-sketches/tampines-greenweave/plan.png",
          metadataPath: "dependencyHashes.topologyProofHash",
        },
      ],
      minWidth: 1500,
      minHeight: 1000,
      minBytes: 500_000,
      aspectMin: 1.45,
      aspectMax: 1.55,
    },
    {
      id: "tampines-greenweave-resonance-hour",
      kind: "resonance_hour",
      scope: "phase1_demo_flagship",
      templateId: "tampines-greenweave",
      relativePath: "resonance-hour/tampines-greenweave/accepted.png",
      metadataRelativePath: "resonance-hour/tampines-greenweave/accepted.json",
      requiredMetadata: {
        templateId: "tampines-greenweave",
        source: "resonance_hour_prebake",
        promptKind: "resonance-hour-background",
        evidenceTier: "prototype_visualisation",
        sourceTruth: "plan-geometry.json",
        inputFingerprintVersion: RESONANCE_HOUR_INPUT_VERSION,
      },
      dependencyHashes: [
        {
          relativePath: "life-sketches/tampines-greenweave/accepted.png",
          metadataPath: "dependencyHashes.acceptedLifeSketchHash",
        },
      ],
      minWidth: 1500,
      minHeight: 1000,
      minBytes: 500_000,
      aspectMin: 1.45,
      aspectMax: 1.55,
    },
  ];

  const referenceAssets: RenderAssetSpec[] = [
    {
      id: "brand-v3-poster-reference",
      kind: "life_reference",
      scope: "phase1_shared_reference",
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
      scope: "phase1_shared_reference",
      relativePath: "references/hdb-material-board.png",
      minWidth: 1024,
      minHeight: 1024,
      minBytes: 50_000,
      aspectMin: 0.95,
      aspectMax: 1.05,
    },
  ];

  return [
    ...heroAssets,
    ...planAssets,
    ...lifeAssets,
    ...acceptedLifeSketchAssets,
    ...flagshipGeneratedAssets,
    ...referenceAssets,
  ];
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
    metadataOk: spec.metadataRelativePath ? null : true,
    issues,
  };
}

export async function validateExpectedRenderAssets(
  publicRoot = path.join(process.cwd(), "public"),
): Promise<RenderAssetValidationReport> {
  const assets = await Promise.all(
    expectedRenderAssets().map(async (spec) => {
      let result: RenderAssetResult;
      try {
        const bytes = await readFile(path.join(publicRoot, spec.relativePath));
        result = validateRenderAsset(spec, bytes);
      } catch (error) {
        const message = (error as NodeJS.ErrnoException).code === "ENOENT" ? "asset file is missing" : "asset file could not be read";
        result = {
          ...spec,
          ok: false,
          width: null,
          height: null,
          byteLength: 0,
          metadataOk: spec.metadataRelativePath ? null : true,
          issues: [`${spec.relativePath}: ${message}. Regenerate committed demo assets.`],
        };
      }

      if (spec.metadataRelativePath) {
        await validateSidecar(publicRoot, spec, result);
      }

      result.ok = result.issues.length === 0;
      return result;
    }),
  );

  const failedCount = assets.filter((asset) => !asset.ok).length;
  return {
    ok: failedCount === 0,
    assetCount: assets.length,
    failedCount,
    assets,
    byTemplate: summarizeByTemplate(assets),
  };
}

async function validateSidecar(
  publicRoot: string,
  spec: RenderAssetSpec,
  result: RenderAssetResult,
): Promise<void> {
  if (!spec.metadataRelativePath) return;

  let metadata: unknown;
  try {
    metadata = JSON.parse(await readFile(path.join(publicRoot, spec.metadataRelativePath), "utf8"));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const message = code === "ENOENT" ? "metadata sidecar is missing" : "metadata sidecar is invalid JSON";
    result.metadataOk = false;
    result.issues.push(`${spec.metadataRelativePath}: ${message}. Regenerate the artifact metadata.`);
    return;
  }

  if (!metadata || typeof metadata !== "object") {
    result.metadataOk = false;
    result.issues.push(`${spec.metadataRelativePath}: metadata sidecar must be a JSON object.`);
    return;
  }

  const record = metadata as Record<string, unknown>;
  const issueCountBeforeMetadataChecks = result.issues.length;
  for (const [key, expected] of Object.entries(spec.requiredMetadata ?? {})) {
    const actual = valueAtPath(record, key);
    if (actual !== expected) {
      result.issues.push(`${spec.metadataRelativePath}: expected ${key}=${JSON.stringify(expected)}; found ${JSON.stringify(actual)}.`);
    }
  }

  for (const dependency of spec.dependencyHashes ?? []) {
    try {
      const bytes = await readFile(path.join(publicRoot, dependency.relativePath));
      const expectedHash = hashBytes(bytes);
      const actualHash = valueAtPath(record, dependency.metadataPath);
      if (actualHash !== expectedHash) {
        result.issues.push(
          `${spec.metadataRelativePath}: expected ${dependency.metadataPath}=${expectedHash} from ${dependency.relativePath}; found ${JSON.stringify(actualHash)}.`,
        );
      }
    } catch {
      result.issues.push(`${dependency.relativePath}: dependency for ${spec.metadataRelativePath} is missing or unreadable.`);
    }
  }

  if (spec.templateId && isTemplateId(spec.templateId)) {
    if (spec.kind === "accepted_life_sketch" && !await resolveAcceptedLifeSketchArtifact(spec.templateId, publicRoot)) {
      result.issues.push(`${spec.relativePath}: accepted image provenance is invalid or stale. Rebuild the anchor and Life Sketch with the current pipeline.`);
    }
    if (spec.kind === "resonance_hour" && !await resolveResonanceHourArtifact(spec.templateId, publicRoot)) {
      result.issues.push(`${spec.relativePath}: Resonance Hour provenance is invalid or stale. Rebuild it from a current accepted Life Sketch.`);
    }
    if (spec.kind === "wind_base" && !await resolveWindBaseArtifact(spec.templateId, publicRoot)) {
      result.issues.push(`${spec.relativePath}: Wind background provenance is invalid or stale. Rebuild it from the current topology proof.`);
    }
  }

  result.metadataOk = result.issues.length === issueCountBeforeMetadataChecks;
}

function summarizeByTemplate(assets: RenderAssetResult[]): TemplateRenderAssetSummary[] {
  return phase1Templates.map((templateId) => {
    const templateAssets = assets.filter((asset) => asset.templateId === templateId);
    return {
      templateId,
      assetCount: templateAssets.length,
      failedCount: templateAssets.filter((asset) => !asset.ok).length,
      assets: templateAssets,
    };
  });
}

function valueAtPath(record: Record<string, unknown>, keyPath: string): unknown {
  return keyPath.split(".").reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[key];
  }, record);
}
