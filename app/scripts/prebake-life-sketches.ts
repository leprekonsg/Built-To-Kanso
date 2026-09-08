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

import process from "node:process";
import type { TemplateId } from "../src/server/geometry/types";
import {
  getAcceptedLifeSketchCachePath,
  validateAcceptedLifeSketchMetadata,
} from "../src/server/sketches/lifeSketchAsset";
import { writeSketchArtifact } from "../src/server/sketches/writeSketchArtifact";

const ALL_TEMPLATES: readonly TemplateId[] = [
  "tampines-greenweave",
  "tengah-5room",
  "resale-exec-1990s",
];

function pickTemplates(): TemplateId[] {
  const raw = process.env.LIFE_SKETCH_TEMPLATES;
  if (!raw) return [...ALL_TEMPLATES];
  const ids = [...new Set(raw.split(",").map((s) => s.trim()))];
  if (ids.some((id) => !(ALL_TEMPLATES as readonly string[]).includes(id))) {
    throw new Error(
      `LIFE_SKETCH_TEMPLATES does not match any known template. Valid ids: ${ALL_TEMPLATES.join(", ")}`,
    );
  }
  return ids as TemplateId[];
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
    if (fallback === "geometry_source_conflict") {
      throw new Error(`${templateId}: geometry_source_conflict. Resolve the curated plan's protected-space overlap before materialization.`);
    }
    throw new Error(
      `materialize returned ${contentType} (fallback: ${fallback}) for ${templateId}. ` +
        decodeURIComponent(res.headers.get("X-Sketch-Failure-Detail") ?? "Inspect the server generation/review log. A rejected candidate batch must not be saved as accepted."),
    );
  }

  const qa = res.headers.get("X-Life-Sketch-QA");
  const encodedMetadata = res.headers.get("X-Life-Sketch-Metadata");
  if (res.headers.has("X-Sketch-Fallback") || !encodedMetadata || !["accepted", "accepted_from_cache"].includes(qa ?? "")) {
    throw new Error(`Life Sketch for ${templateId} did not include accepted server provenance. Update/restart the server and retry.`);
  }
  const png = Buffer.from(await res.arrayBuffer());
  const cache = getAcceptedLifeSketchCachePath(templateId);
  const metadata = await validateAcceptedLifeSketchMetadata(
    templateId, png, JSON.parse(Buffer.from(encodedMetadata, "base64").toString("utf8")),
  );
  if (!metadata) {
    throw new Error(`Server image provenance does not match current inputs for ${templateId}. Use the same checkout/cache roots as the server, then retry.`);
  }
  await writeSketchArtifact(cache.absolutePath, cache.metadataAbsolutePath, png, metadata);

  console.log(`  ${templateId}: png ${(png.byteLength / 1024).toFixed(0)} KB, ${metadata.candidateCount} candidates, accepted #${metadata.acceptedCandidateIndex}, ${elapsed}s`);
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
  const failures: string[] = [];
  for (const templateId of templates) {
    try {
      results.push(await bakeOne(templateId));
    } catch (error) {
      const failure = `${templateId}: ${error instanceof Error ? error.message : String(error)}`;
      failures.push(failure);
      console.error(failure);
    }
  }

  const totalKb = results.reduce((s, r) => s + r.png, 0) / 1024;
  console.log(`done: ${results.length} templates, ${totalKb.toFixed(0)} KB total.`);
  if (failures.length > 0) throw new Error(`${failures.length} template(s) failed; successful templates were saved. See failures above.`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`prebake-life-sketches failed: ${message}`);
  // Diagnostic hint for the most common failure mode.
  if (typeof err === "object" && err && "cause" in err) {
    console.error(`cause: ${String((err as { cause?: unknown }).cause)}`);
  }
  console.error("hint: resolve the reported source/provenance or server error, then retry the affected LIFE_SKETCH_TEMPLATES only.");
  process.exit(1);
});
