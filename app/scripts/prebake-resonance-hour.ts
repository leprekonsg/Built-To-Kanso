/**
 * Generates the Resonance Hour closing image for each template by hitting
 * /api/sketches/resonance-hour with the accepted Life Sketch as the source.
 * Saves the polished PNG to public/resonance-hour/<templateId>/accepted.png.
 *
 * The Resonance Hour still is the brief's closing image (Section 20/21): a
 * 3D Life Sketch where the moment "evening wind has just arrived" is made
 * visible through sheer curtain lift, dust motes in late balcony light, and
 * subtle leaf tilt. Wind is implied, never drawn.
 *
 * Run from app/ with the dev server up:
 *   npm run prebake:resonance-hour
 *   GUIDE_BASE_URL=http://localhost:3030 LIFE_SKETCH_TEMPLATES=tampines-greenweave \
 *     npm run prebake:resonance-hour
 *
 * Idempotent — re-running overwrites the cached PNG. The route is required to
 * return image/png with X-Sketch-Source set to resonance-hour-background; any
 * fallback header aborts the write so a quiet OpenAI failure does not silently
 * pin the un-polished Life Sketch as the resonance still.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import type { TemplateId } from "../src/server/geometry/types";

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
    throw new Error(`LIFE_SKETCH_TEMPLATES does not match any known template. Valid ids: ${ALL_TEMPLATES.join(", ")}`);
  }
  return ids;
}

function baseUrl(): string {
  return process.env.GUIDE_BASE_URL ?? "http://localhost:3000";
}

function cachePath(templateId: TemplateId): string {
  return resolve(process.cwd(), "public", "resonance-hour", templateId, "accepted.png");
}

interface PrebakeOutcome {
  templateId: TemplateId;
  pngBytes: number;
  cachePath: string;
}

async function bakeOne(templateId: TemplateId): Promise<PrebakeOutcome> {
  const url = `${baseUrl()}/api/sketches/resonance-hour`;
  const t0 = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "image/png" },
    body: JSON.stringify({ templateId }),
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`resonance-hour call returned ${res.status} for ${templateId}: ${body.slice(0, 200)}`);
  }

  const contentType = res.headers.get("Content-Type") ?? "";
  const source = res.headers.get("X-Sketch-Source") ?? "unknown";
  const fallback = res.headers.get("X-Sketch-Fallback");
  if (!contentType.startsWith("image/png") || source !== "resonance-hour-background") {
    throw new Error(
      `resonance-hour returned ${contentType} (source=${source}, fallback=${fallback ?? "none"}) for ${templateId}. ` +
        "Run prebake:life-sketches first, ensure OPENAI_API_KEY is set, and retry.",
    );
  }

  const bytes = Buffer.from(await res.arrayBuffer());
  const path = cachePath(templateId);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  console.log(`  ${templateId}: png ${Math.round(bytes.byteLength / 1024)} KB, ${elapsed}s -> resonance-hour/${templateId}/accepted.png`);
  return { templateId, pngBytes: bytes.byteLength, cachePath: path };
}

async function main(): Promise<void> {
  const templates = pickTemplates();
  console.log(`Prebaking Resonance Hour images against ${baseUrl()}`);
  console.log(`Templates: ${templates.join(", ")}`);

  let totalBytes = 0;
  for (const templateId of templates) {
    const outcome = await bakeOne(templateId);
    totalBytes += outcome.pngBytes;
  }
  console.log(`done: ${templates.length} template(s), ${Math.round(totalBytes / 1024)} KB total.`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("prebake-resonance-hour failed:", message);
  console.error("hint: ensure the dev server is running, OPENAI_API_KEY is set, and accepted Life Sketches exist (npm run prebake:life-sketches).");
  process.exit(1);
});
