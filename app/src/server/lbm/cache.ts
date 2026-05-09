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
import type { TokenPlacement } from "@/server/rules/tokens";
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

export interface ExpandedPrebakeKeyParts {
  templateId: string;
  compassDeg: number;
  tokenPlacements?: ReadonlyArray<TokenPlacement>;
  candidatePositions?: ReadonlyArray<TokenPlacement>;
  weatherCondition?: string;
}

/**
 * Read a pre-baked field from disk. Returns `null` if no record exists for
 * `(templateId, snappedCompassDeg)`.
 *
 * compassDeg is snapped to the nearest cardinal (0/90/180/270) for lookup,
 * matching the angles produced by `prebake.ts`.
 */
export const loadPrebakedField = cache(
  (
    templateId: string,
    compassDeg: number,
    options: Omit<ExpandedPrebakeKeyParts, "templateId" | "compassDeg"> = {},
  ): VelocityField | null => {
    const snap = snapToCardinal(compassDeg);
    const expandedFile = path.join(CACHE_DIR, `${buildExpandedPrebakeFilename({
      templateId,
      compassDeg: snap,
      ...options,
    })}.json`);
    const legacyFile = path.join(CACHE_DIR, `${templateId}__${snap}.json`);
    const file = fs.existsSync(expandedFile) ? expandedFile : legacyFile;
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as PrebakeRecord;
    const data = new Float32Array(parsed.data);
    const field: RawVelocityField = { width: parsed.width, height: parsed.height, data };
    return field as unknown as VelocityField;
  },
);

export function buildExpandedPrebakeFilename(input: ExpandedPrebakeKeyParts): string {
  return [
    "tier4-v1",
    safePart(input.templateId),
    `deg-${snapToCardinal(input.compassDeg)}`,
    `weather-${safePart(input.weatherCondition ?? "baseline_monsoon")}`,
    `tokens-${safePart(formatPlacements(input.tokenPlacements ?? []))}`,
    `candidates-${safePart(formatPlacements(input.candidatePositions ?? []))}`,
  ].join("__");
}

export function snapToCardinal(deg: number): 0 | 90 | 180 | 270 {
  const c = ((deg % 360) + 360) % 360;
  if (c < 45 || c >= 315) return 0;
  if (c < 135) return 90;
  if (c < 225) return 180;
  return 270;
}

function formatPlacements(placements: ReadonlyArray<TokenPlacement>): string {
  if (placements.length === 0) return "none";

  return [...placements]
    .map((placement) => ({
      tokenId: placement.tokenId,
      x: round(placement.point.x),
      y: round(placement.point.y),
    }))
    .sort((a, b) => a.tokenId.localeCompare(b.tokenId) || a.x - b.x || a.y - b.y)
    .map((placement) => `${placement.tokenId}-${placement.x.toFixed(2)}-${placement.y.toFixed(2)}`)
    .join("_");
}

function safePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
