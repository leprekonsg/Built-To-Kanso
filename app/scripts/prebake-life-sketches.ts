/**
 * Generates "accepted GPT Image 2" Life Sketch prebakes by calling the running
 * dev server's /api/sketches/life?materialize=1 endpoint. Saves PNG + metadata
 * to public/life-sketches/<templateId>/ so the runtime route serves the
 * accepted golden path instead of the deterministic fallback.
 *
 * Run from app/ with the dev server up:
 *   GUIDE_BASE_URL=http://localhost:3030 npm run prebake:life-sketches
 *   GUIDE_BASE_URL=http://localhost:3030 LIFE_SKETCH_TEMPLATES=tampines-greenweave npm run prebake:life-sketches
 *
 * The script is idempotent: re-running overwrites the cached PNG and metadata.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { hashBytes } from "../src/lib/imageHash";
import { getLifeAnchorCachePath } from "../src/server/anchors/lifeAnchor";
import type { TemplateId } from "../src/server/geometry/types";
import { getPlanSketchCachePath } from "../src/server/sketches/planSketchAsset";
import {
  LIFE_SKETCH_INPUT_FINGERPRINT_VERSION,
  getAcceptedLifeSketchCachePath,
} from "../src/server/sketches/lifeSketchAsset";

const ALL_TEMPLATES: readonly TemplateId[] = [
  "tampines-greenweave",
  "tengah-5room",
  "resale-exec-1990s",
];

function pickTemplates(): TemplateId[] {
  const raw = process.env.LIFE_SKETCH_TEMPLATES;
  if (!raw) return [...ALL_TEMPLATES];
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is TemplateId => (ALL_TEMPLATES as readonly string[]).includes(s));
  if (ids.length === 0) {
    throw new Error(
      `LIFE_SKETCH_TEMPLATES does not match any known template. Valid ids: ${ALL_TEMPLATES.join(", ")}`,
    );
  }
  return ids;
}

function baseUrl(): string {
  return process.env.GUIDE_BASE_URL ?? "http://localhost:3000";
}

interface PrebakeOutcome {
  templateId: TemplateId;
  png: number;
  metadataPath: string;
  pngPath: string;
}

async function bakeOne(templateId: TemplateId): Promise<PrebakeOutcome> {
  const url = `${baseUrl()}/api/sketches/life?materialize=1`;
  const t0 = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "image/png",
    },
    body: JSON.stringify({ templateId }),
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`materialize call returned ${res.status} for ${templateId}: ${body.slice(0, 200)}`);
  }

  const contentType = res.headers.get("Content-Type") ?? "";
  if (!contentType.startsWith("image/png")) {
    const fallback = res.headers.get("X-Sketch-Fallback") ?? "unknown";
    throw new Error(
      `materialize returned ${contentType} (fallback: ${fallback}) for ${templateId}. ` +
        "The dev server may be missing OPENAI_API_KEY or the anchor PNG. Check .env.local.",
    );
  }

  const candidateCount = Number(res.headers.get("X-Life-Sketch-Candidates") ?? "0");
  const acceptedIndexHeader = res.headers.get("X-Life-Sketch-Accepted-Candidate");
  const acceptedCandidateIndex = acceptedIndexHeader === null ? 0 : Number(acceptedIndexHeader);
  const reviewerModel = res.headers.get("X-Life-Sketch-QA-Model") ?? undefined;
  const anchorCachePath = res.headers.get("X-Life-Anchor-Cache-Path") ?? undefined;
  const topologyProof = `plan-sketches/${templateId}/plan.png`;
  const promptId = res.headers.get("X-Prompt-Id") ?? "life-sketch-from-anchor";

  if (candidateCount < 2 || acceptedCandidateIndex < 0) {
    throw new Error(
      `metadata sanity check failed for ${templateId}: candidates=${candidateCount}, accepted=${acceptedCandidateIndex}`,
    );
  }

  const png = Buffer.from(await res.arrayBuffer());
  const cache = getAcceptedLifeSketchCachePath(templateId);
  const anchorPath = getLifeAnchorCachePath(templateId);
  const proofPath = getPlanSketchCachePath(templateId);
  const [anchorBytes, topologyProofBytes] = await Promise.all([
    readFile(anchorPath.absolutePath),
    readFile(proofPath.absolutePath),
  ]);
  await mkdir(dirname(cache.absolutePath), { recursive: true });

  const metadata = {
    templateId,
    source: "accepted_gpt_image_2_prebake" as const,
    promptKind: promptId,
    candidateCount,
    acceptedCandidateIndex,
    rejectedCandidates: [],
    acceptedAtIso: new Date().toISOString(),
    ...(reviewerModel ? { reviewerModel } : {}),
    ...(anchorCachePath ? { anchorCachePath } : {}),
    topologyProof,
    inputFingerprintVersion: LIFE_SKETCH_INPUT_FINGERPRINT_VERSION,
    anchorHash: hashBytes(anchorBytes),
    topologyProofHash: hashBytes(topologyProofBytes),
  };

  await writeFile(cache.absolutePath, png);
  await writeFile(cache.metadataAbsolutePath, JSON.stringify(metadata, null, 2), "utf8");

  console.log(`  ${templateId}: png ${(png.byteLength / 1024).toFixed(0)} KB, ${candidateCount} candidates, accepted #${acceptedCandidateIndex}, ${elapsed}s`);
  console.log(`    -> ${cache.relativePath}`);

  return {
    templateId,
    png: png.byteLength,
    metadataPath: cache.metadataRelativePath,
    pngPath: cache.relativePath,
  };
}

async function main(): Promise<void> {
  const templates = pickTemplates();
  console.log(`Prebaking accepted Life Sketches against ${baseUrl()}`);
  console.log(`Templates: ${templates.join(", ")}`);

  const results: PrebakeOutcome[] = [];
  for (const templateId of templates) {
    const outcome = await bakeOne(templateId);
    results.push(outcome);
  }

  const totalKb = results.reduce((s, r) => s + r.png, 0) / 1024;
  console.log(`done: ${results.length} templates, ${totalKb.toFixed(0)} KB total.`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`prebake-life-sketches failed: ${message}`);
  // Diagnostic hint for the most common failure mode.
  if (typeof err === "object" && err && "cause" in err) {
    console.error(`cause: ${String((err as { cause?: unknown }).cause)}`);
  }
  console.error(`hint: ensure the dev server is running and OPENAI_API_KEY is set in .env.local.`);
  console.error(`hint: pass GUIDE_BASE_URL=http://localhost:3030 if your dev server is on a non-default port.`);
  process.exit(1);
});

// Resolve unused import warning during dev (resolve is part of the API surface
// in case future variants need cacheRoot overrides).
void resolve;
