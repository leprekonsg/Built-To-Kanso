/**
 * Pre-bake script: run the CPU LBM reference for each template x cardinal
 * compass angle and persist the velocity field as JSON in `./cache/`.
 *
 * Run from the `app/` directory:
 *   npx tsx src/server/lbm/prebake.ts
 *
 * NOTE: tsx is not currently in package.json. Flag for the project owner —
 * see report. As an alternative run via `npx ts-node` if added.
 *
 * Output filenames: `<templateId>__<compassDeg>.json` matching cache.ts.
 */

import fs from "node:fs";
import path from "node:path";
import { getPlanGeometry, isTemplateId, listGeometrySummaries } from "@/server/geometry/registry";
import type { TemplateId } from "@/server/geometry/types";
import { runLbmCpu } from "./solver";
import type { RawVelocityField } from "./types";

const CARDINALS: ReadonlyArray<0 | 90 | 180 | 270> = [0, 90, 180, 270];
/** Reduced grid + iters so the bake completes in a handful of seconds per pair. */
const GRID = 64;
const ITERS = 600;
const AMBIENT_MPS = 1.5;

const CACHE_DIR = path.join(process.cwd(), "src", "server", "lbm", "cache");

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const templates = listGeometrySummaries().map((s) => s.templateId);
  let count = 0;
  for (const templateId of templates) {
    if (!isTemplateId(templateId)) continue;
    const plan = getPlanGeometry(templateId as TemplateId);
    for (const compassDeg of CARDINALS) {
      const t0 = Date.now();
      const field = runLbmCpu(plan, compassDeg, AMBIENT_MPS, ITERS, GRID);
      // VelocityField nominally pins 256x256 in its type; the runtime grid
      // size lives on width/height. See types.ts.
      const raw = field as unknown as RawVelocityField;
      const record = {
        templateId,
        compassDeg,
        width: raw.width,
        height: raw.height,
        // JSON cannot hold Float32Array directly; serialize as a plain number
        // array. cache.ts wraps it back into Float32Array on load.
        data: Array.from(raw.data),
        meta: {
          iterations: ITERS,
          ambientWindMps: AMBIENT_MPS,
          bakedAt: new Date().toISOString(),
        },
      };
      const file = path.join(CACHE_DIR, `${templateId}__${compassDeg}.json`);
      fs.writeFileSync(file, JSON.stringify(record));
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`baked ${templateId} @ ${compassDeg}deg in ${dt}s -> ${path.basename(file)}`);
      count++;
    }
  }
  console.log(`done: ${count} field(s)`);
}

main().catch((err: unknown) => {
  console.error("prebake failed:", err);
  process.exit(1);
});
