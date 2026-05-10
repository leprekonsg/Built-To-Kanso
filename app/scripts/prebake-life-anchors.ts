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
  buildLifeAnchorSceneManifest,
  getLifeAnchorCachePath,
  renderLifeAnchorPng,
  type LifeAnchorSceneManifest,
} from "../src/server/anchors/lifeAnchor";

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

function renderManifestSvg(manifest: LifeAnchorSceneManifest): string {
  const { width, height } = manifest.viewport;
  const { left, right, top, bottom, lookAt } = manifest.camera;
  const frustumWidth = right - left;
  const frustumHeight = top - bottom;
  const cx = lookAt[0];
  const cz = lookAt[2];
  const px = (x: number) => ((x - cx - left) / frustumWidth) * width;
  const py = (z: number) => height - ((z - cz - bottom) / frustumHeight) * height;
  const roomFill = (confidence: string) =>
    confidence === "black" ? "#DDD6C8" : confidence === "amber" ? "#F0D7A3" : "#EFE9DC";

  const rooms = manifest.rooms
    .map((room) => {
      const [x, , z] = room.position;
      const [w, , h] = room.scale;
      return (
        `<rect data-room="${room.id}" x="${round(px(x - w / 2))}" y="${round(py(z + h / 2))}" ` +
        `width="${round((w / frustumWidth) * width)}" height="${round((h / frustumHeight) * height)}" ` +
        `fill="${roomFill(room.confidence)}" stroke="#111111" stroke-opacity="0.14"/>`
      );
    })
    .join("");
  const fixed = manifest.fixedElements
    .map((element) => {
      const [x, , z] = element.position;
      const [w, , h] = element.scale;
      const fill = element.kind === "pipeshaft_opening" ? "#B96F4D" : "#111111";
      return (
        `<rect data-fixed="${element.id}" x="${round(px(x - w / 2))}" y="${round(py(z + h / 2))}" ` +
        `width="${round((w / frustumWidth) * width)}" height="${round((h / frustumHeight) * height)}" ` +
        `fill="${fill}" fill-opacity="0.22" stroke="${fill}" stroke-opacity="0.55"/>`
      );
    })
    .join("");
  const openings = manifest.openings
    .map((opening) => {
      const color = opening.kind === "door" ? "#D8A24A" : opening.kind === "window" ? "#7C856D" : "#A79F93";
      return (
        `<line data-opening="${opening.id}" x1="${round(px(opening.start[0]))}" y1="${round(py(opening.start[2]))}" ` +
        `x2="${round(px(opening.end[0]))}" y2="${round(py(opening.end[2]))}" ` +
        `stroke="${color}" stroke-width="8" stroke-linecap="round"/>`
      );
    })
    .join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ` +
    `data-anchor-source="${manifest.metadata.source}">` +
    `<rect width="100%" height="100%" fill="#F5F1E8"/>` +
    rooms +
    fixed +
    openings +
    `</svg>`
  );
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
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
        return rasterizeSvgToPng(resvg, renderManifestSvg(manifest));
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
  const svg = renderManifestSvg(buildLifeAnchorSceneManifest(plan));
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
