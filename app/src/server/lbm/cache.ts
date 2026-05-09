/**
 * Tier 4 prebake cache loader.
 *
 * Per CLAUDE.md "Tier 4 fallback: if WebGPU fails, pre-baked LBM results
 * serve silently. Never surface the fallback to the user."
 *
 * Vercel rule "server-cache-react": wrap the loader in `React.cache` so a
 * single request that calls it multiple times only hits disk once.
 */

import { cache } from "react";
import fs from "node:fs";
import path from "node:path";
import type { RawVelocityField, VelocityField } from "./types";

interface PrebakeRecord {
  templateId: string;
  compassDeg: number;
  width: number;
  height: number;
  /** [u, v] interleaved, length = width*height*2. Stored as a regular JSON array. */
  data: number[];
  meta?: {
    iterations: number;
    ambientWindMps: number;
    bakedAt: string;
  };
}

const CACHE_DIR = path.join(process.cwd(), "src", "server", "lbm", "cache");

/**
 * Read a pre-baked field from disk. Returns `null` if no record exists for
 * `(templateId, snappedCompassDeg)`.
 *
 * compassDeg is snapped to the nearest cardinal (0/90/180/270) for lookup,
 * matching the angles produced by `prebake.ts`.
 */
export const loadPrebakedField = cache(
  (templateId: string, compassDeg: number): VelocityField | null => {
    const snap = snapToCardinal(compassDeg);
    const file = path.join(CACHE_DIR, `${templateId}__${snap}.json`);
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as PrebakeRecord;
    const data = new Float32Array(parsed.data);
    const field: RawVelocityField = { width: parsed.width, height: parsed.height, data };
    return field as unknown as VelocityField;
  },
);

export function snapToCardinal(deg: number): 0 | 90 | 180 | 270 {
  const c = ((deg % 360) + 360) % 360;
  if (c < 45 || c >= 315) return 0;
  if (c < 135) return 90;
  if (c < 225) return 180;
  return 270;
}
