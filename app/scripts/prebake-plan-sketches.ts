/**
 * Prebake deterministic Plan Sketch PNG assets for the no-cloud demo path.
 *
 * Writes:
 *   public/plan-sketches/<templateId>/plan.png
 */

import { mkdir, writeFile } from "node:fs/promises";
import { getPlanGeometry, listGeometrySummaries } from "../src/server/geometry/registry";
import { renderPlanSketchFallbackSvg } from "../src/server/openai/fallbackSvg";
import { rasterizeSvgToPng } from "../src/server/openai/svgRaster";
import { getPlanSketchCachePath } from "../src/server/sketches/planSketchAsset";

async function main() {
  let pngCount = 0;
  for (const summary of listGeometrySummaries()) {
    const plan = getPlanGeometry(summary.templateId);
    const cache = getPlanSketchCachePath(plan.templateId);
    const svg = renderPlanSketchFallbackSvg(plan);
    const raster = await rasterizeSvgToPng(svg);
    if (!raster.ok) {
      throw new Error(
        `Plan Sketch rasterizer unavailable for ${plan.templateId}: ${raster.message}`,
      );
    }
    await mkdir(cache.directory, { recursive: true });
    await writeFile(cache.absolutePath, raster.png);
    pngCount += 1;
    console.log(`${plan.templateId}: image/png -> ${cache.absolutePath}`);
  }
  console.log(`done: ${pngCount} PNG across ${listGeometrySummaries().length} templates.`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`prebake-plan-sketches failed: ${message}`);
  process.exitCode = 1;
});
