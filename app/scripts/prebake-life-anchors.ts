/**
 * Build-time prebake for Three.js Life Sketch anchor renders (Brief Section
 * 15, item 3). Produces one anchor per template (3 total) and writes:
 *   - local: public/life-anchors/<templateId>/anchor.{png|svg}
 *
 * R2 is OUT of Phase 1 as of 2026-05-09. The runtime route reads the local
 * public cache file directly; there is no remote upload.
 *
 * This script intentionally avoids native GPU bindings (gl, headless-gl). The
 * portable strategy is to render the deterministic anchor SVG and rasterize
 * it with @resvg/resvg-js when available. If resvg is not installed, the SVG
 * is written next to the expected PNG path and the runtime route falls back
 * to the deterministic SVG it already serves.
 *
 * Run from the `app/` directory:
 *   npm run prebake:anchors
 *   # or directly:
 *   npx tsx scripts/prebake-life-anchors.ts
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import process from "node:process";
import { getPlanGeometry } from "../src/server/geometry/registry";
import type { TemplateId } from "../src/server/geometry/types";
import {
  getLifeAnchorCachePath,
  renderLifeAnchorPng,
} from "../src/server/anchors/lifeAnchor";
import { renderLifeAnchorSceneSvg } from "../src/server/anchors/lifeAnchorRender";

const TEMPLATE_IDS: readonly TemplateId[] = [
  "tampines-greenweave",
  "tengah-5room",
  "resale-exec-1990s",
];

interface ResvgModule {
  Resvg: new (svg: string | Buffer, opts?: { fitTo?: { mode: "width"; value: number } }) => {
    render(): { asPng(): Uint8Array };
  };
}

async function loadResvg(): Promise<ResvgModule | null> {
  try {
    const mod = (await import("@resvg/resvg-js")) as unknown as ResvgModule;
    if (mod && typeof mod.Resvg === "function") return mod;
    return null;
  } catch {
    return null;
  }
}

function rasterizeSvgToPng(resvg: ResvgModule, svg: string): Buffer {
  const renderer = new resvg.Resvg(svg, { fitTo: { mode: "width", value: 1536 } });
  const out = renderer.render().asPng();
  return Buffer.from(out);
}

interface BakeOutcome {
  templateId: TemplateId;
  contentType: "image/png" | "image/svg+xml";
  localPath: string;
  notes?: string;
}

async function bakeTemplate(
  templateId: TemplateId,
  resvg: ResvgModule | null,
): Promise<BakeOutcome> {
  const plan = getPlanGeometry(templateId);
  const cache = getLifeAnchorCachePath(templateId);

  await mkdir(dirname(cache.absolutePath), { recursive: true });

  if (resvg) {
    const rendered = await renderLifeAnchorPng(plan, {
      async renderPng({ manifest }) {
        return rasterizeSvgToPng(resvg, renderLifeAnchorSceneSvg(manifest));
      },
    });
    if (!rendered.ok) {
      throw new Error(`PNG renderer unavailable for ${templateId}.`);
    }
    const png = rendered.png;
    await writeFile(cache.absolutePath, png);
    return {
      templateId,
      contentType: "image/png",
      localPath: cache.absolutePath,
    };
  }

  // No rasterizer available — write SVG sidecar so the runtime route can
  // still find a deterministic artifact at the expected directory. The PNG
  // path remains absent so resolveLifeAnchorArtifact() falls through to
  // its inline deterministic SVG path; this sidecar exists only as a build
  // artifact for inspection.
  const rendered = await renderLifeAnchorPng(plan);
  const svg = renderLifeAnchorSceneSvg(rendered.manifest);
  const svgPath = cache.absolutePath.replace(/\.png$/, ".svg");
  await writeFile(svgPath, svg, "utf8");
  return {
    templateId,
    contentType: "image/svg+xml",
    localPath: svgPath,
    notes:
      "PNG rasterizer unavailable, SVG anchor written instead. Install @resvg/resvg-js to enable PNG output: npm install --save-optional @resvg/resvg-js.",
  };
}

async function main(): Promise<void> {
  const resvg = await loadResvg();
  if (!resvg) {
    console.warn(
      "@resvg/resvg-js not available. Anchors will be written as SVG sidecars only. " +
        "Run `npm install --save-optional @resvg/resvg-js` to enable PNG output.",
    );
  }

  const results: BakeOutcome[] = [];
  for (const templateId of TEMPLATE_IDS) {
    const t0 = Date.now();
    const outcome = await bakeTemplate(templateId, resvg);
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(
      `${templateId}: ${outcome.contentType} -> ${outcome.localPath} (${dt}s)${outcome.notes ? ` [${outcome.notes}]` : ""}`,
    );
    results.push(outcome);
  }

  const pngCount = results.filter((r) => r.contentType === "image/png").length;
  const svgCount = results.filter((r) => r.contentType === "image/svg+xml").length;
  console.log(
    `done: ${pngCount} PNG, ${svgCount} SVG-fallback across ${results.length} templates.`,
  );
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`prebake-life-anchors failed: ${message}`);
  process.exit(1);
});
