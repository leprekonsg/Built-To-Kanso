/**
 * Generates the Stage B sumi-e top-down background for the Wind Sketch by
 * hitting /api/sketches/wind-base with the locked topology proof. Saves the
 * polished PNG to public/wind-base/<templateId>/base.png. Stage C composes
 * the deterministic LBM streamlines on top at request time; this Stage B PNG
 * must contain no streamlines, furniture, or labels.
 *
 * Run from app/ with the dev server up:
 *   npm run prebake:wind-base
 *   GUIDE_BASE_URL=http://localhost:3030 LIFE_SKETCH_TEMPLATES=tampines-greenweave \
 *     npm run prebake:wind-base
 *
 * Idempotent. Aborts if X-Sketch-Source on the response is anything other than
 * wind-sketch-base so a quiet OpenAI failure does not silently overwrite the
 * cached base.
 */

import process from "node:process";
import { resolveCurrentPlanSketchArtifact } from "../src/server/sketches/planSketchAsset";
import { getWindBaseCachePath, validateWindBaseMetadata } from "../src/server/sketches/windBaseAsset";
import { writeSketchArtifact } from "../src/server/sketches/writeSketchArtifact";
import type { TemplateId } from "../src/server/geometry/types";

const ALL_TEMPLATES: readonly TemplateId[] = [
  "tampines-greenweave",
  "tengah-5room",
  "resale-exec-1990s",
];

function pickTemplates(): TemplateId[] {
  const raw = process.env.LIFE_SKETCH_TEMPLATES;
  if (!raw) return [...ALL_TEMPLATES];
  const ids = [...new Set(raw.split(",").map((id) => id.trim()))];
  if (ids.some((id) => !(ALL_TEMPLATES as readonly string[]).includes(id))) {
    throw new Error(`LIFE_SKETCH_TEMPLATES must contain only: ${ALL_TEMPLATES.join(", ")}`);
  }
  return ids as TemplateId[];
}

function baseUrl(): string {
  return process.env.GUIDE_BASE_URL ?? "http://localhost:3000";
}

async function bakeOne(templateId: TemplateId): Promise<number> {
  const url = `${baseUrl()}/api/sketches/wind-base`;
  const t0 = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "image/png" },
    body: JSON.stringify({ templateId }),
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`wind-base call returned ${res.status} for ${templateId}: ${body.slice(0, 200)}`);
  }

  const contentType = res.headers.get("Content-Type") ?? "";
  const source = res.headers.get("X-Sketch-Source") ?? "unknown";
  if (!contentType.startsWith("image/png") || source !== "wind-sketch-base") {
    throw new Error(
      `wind-base returned ${contentType} (source=${source}) for ${templateId}. ` +
        "Run prebake:plans first, ensure OPENAI_API_KEY is set, and retry.",
    );
  }

  const bytes = Buffer.from(await res.arrayBuffer());
  const encoded = res.headers.get("X-Wind-Base-Metadata");
  const topology = await resolveCurrentPlanSketchArtifact(templateId);
  const metadata: unknown = encoded ? JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) : null;
  if (!topology || !validateWindBaseMetadata(templateId, topology, bytes, metadata)) {
    throw new Error(`Wind background provenance for ${templateId} does not match the current topology or output. Rebuild plans and use the same checkout as the server.`);
  }
  const cache = getWindBaseCachePath(templateId);
  await writeSketchArtifact(cache.absolutePath, cache.metadataAbsolutePath, bytes, metadata);
  console.log(`  ${templateId}: png ${Math.round(bytes.byteLength / 1024)} KB, ${elapsed}s -> wind-base/${templateId}/base.png`);
  return bytes.byteLength;
}

async function main(): Promise<void> {
  const templates = pickTemplates();
  console.log(`Prebaking Wind Sketch Stage B against ${baseUrl()}`);
  console.log(`Templates: ${templates.join(", ")}`);
  let totalBytes = 0;
  const failures: string[] = [];
  for (const templateId of templates) {
    try {
      totalBytes += await bakeOne(templateId);
    } catch (error) {
      failures.push(`${templateId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failures.length) throw new Error(failures.join("\n"));
  console.log(`done: ${templates.length} template(s), ${Math.round(totalBytes / 1024)} KB total.`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("prebake-wind-base failed:", message);
  console.error("hint: ensure the dev server is running, OPENAI_API_KEY is set, and topology proofs exist (npm run prebake:plans).");
  process.exit(1);
});
