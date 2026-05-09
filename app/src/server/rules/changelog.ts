import type { PlanGeometry } from "@/server/geometry/types";
import { validateTokenPlacement, type TokenPlacement, type TokenPlacementResult } from "@/server/rules/tokens";

export interface HouseChangelogInput {
  plan: PlanGeometry;
  placements: TokenPlacement[];
}

export interface HouseChangelogResult {
  allowed: boolean;
  lines: string[];
  alternatives: string[];
}

const MAX_LINES = 5;

export function generateHouseChangelog(input: HouseChangelogInput): HouseChangelogResult {
  const checked = input.placements.map((placement) => ({
    placement,
    result: validateTokenPlacement(input.plan, placement),
  }));
  const blocked = checked.find(({ result }) => !result.allowed);

  if (blocked) return blockedChangelog(blocked.result);

  return {
    allowed: true,
    lines: validChangelog(input.placements).slice(0, MAX_LINES),
    alternatives: [],
  };
}

function validChangelog(placements: TokenPlacement[]): string[] {
  const tokenIds = new Set(placements.map((placement) => placement.tokenId));
  const lines: string[] = [];

  if (tokenIds.has("wind_gate") || tokenIds.has("soft_screen")) {
    lines.push("entry rush softened");
  }

  if (tokenIds.has("shaft_buffer")) {
    lines.push("pipeshaft jet deflected");
  }

  lines.push("one corner left empty", "no fixed HDB elements touched");

  return lines;
}

function blockedChangelog(result: TokenPlacementResult): HouseChangelogResult {
  return {
    allowed: false,
    lines: [result.message, ...result.alternatives].slice(0, MAX_LINES),
    alternatives: result.alternatives,
  };
}
