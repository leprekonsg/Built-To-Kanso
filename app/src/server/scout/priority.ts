import type { AskingPoint } from "@/server/scout/scout";

// Deterministic priority for the max-three Asking Points (PRODUCT.md §
// "Calm voice over alarm"). Black-state involvement first because a fixed
// element (pipeshaft, structural wall) cannot be re-placed; Damp High next
// because it is the homeowner's headline anxiety; bathroom-downwind ahead
// of west-sun because air paths beat envelope thermals; opening-marginal
// last among the breath family because it is the most easily mitigated.

const PRIORITY_BUCKETS: ReadonlyArray<{
  rank: number;
  match: (point: AskingPoint) => boolean;
}> = [
  // 1. Black-state / fixed-element Asking Points.
  // Pipeshaft is a Black-state object; bathroom locations are also fixed,
  // but we keep bathroom-downwind in its own bucket (#3) because the user
  // can mitigate with a timer. Anything else flagged as black-state via id
  // prefix would land here too.
  { rank: 1, match: (p) => p.id.startsWith("breath-pipeshaft") && p.id !== "breath-pipeshaft-drift" },
  // 2. Damp High band (id starts with "damp-")
  { rank: 2, match: (p) => p.id.startsWith("damp-") },
  // 3. Bathroom-downwind
  { rank: 3, match: (p) => p.id.startsWith("breath-bathroom-downwind") || p.id.startsWith("bathroom-downwind") },
  // 4. West-sun edge
  { rank: 4, match: (p) => p.id === "glow-west-edge" },
  // 5. Opening marginal
  { rank: 5, match: (p) => p.id === "breath-opening-marginal" },
  // 6. Pipeshaft drift (the mitigable variant)
  { rank: 6, match: (p) => p.id === "breath-pipeshaft-drift" },
];

const FALLBACK_RANK = Number.MAX_SAFE_INTEGER;

function rankOf(point: AskingPoint): number {
  for (const bucket of PRIORITY_BUCKETS) {
    if (bucket.match(point)) return bucket.rank;
  }
  return FALLBACK_RANK;
}

/**
 * Stable-sort Asking Points by deterministic priority. Ties resolve to
 * insertion order (Array.prototype.sort is stable in V8 since 7.0).
 */
export function rankAskingPoints(points: AskingPoint[]): AskingPoint[] {
  return [...points].sort((a, b) => rankOf(a) - rankOf(b));
}
