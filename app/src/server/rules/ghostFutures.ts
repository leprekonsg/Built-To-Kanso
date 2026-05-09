import type { EvidenceTier } from "@/server/evidence";
import type { PlanGeometry } from "@/server/geometry/types";
import { runScoutPass, type DampRiskBand } from "@/server/scout/scout";
import { validateTokenPlacement, type TokenPlacement } from "@/server/rules/tokens";

export interface GhostFutureInput {
  plan: PlanGeometry;
  compassDeg: number;
  floor: number;
  placements: TokenPlacement[];
  candidate: TokenPlacement;
}

export type GhostFutureSlot = "A" | "B" | "C";
export type GhostFutureRole = "recommended" | "current" | "alternate" | "candidate";

export interface GhostFuture {
  slot?: GhostFutureSlot;
  role?: GhostFutureRole;
  tokenId: TokenPlacement["tokenId"] | null;
  allowed: boolean;
  code: "ok" | "black_state_blocked" | "shaft_buffer_out_of_range";
  preview: string;
  breathDelta: {
    label: string;
    estimatedChangePct: number;
    tier: EvidenceTier;
  };
  dampDelta?: {
    roomId: string;
    beforeBand: DampRiskBand;
    afterBand: DampRiskBand;
    label: string;
    tier: EvidenceTier;
  };
  breathCopy: string;
  dampBandCopy: string;
  alternatives: string[];
}

const BREATH_DELTAS: Record<TokenPlacement["tokenId"], GhostFuture["breathDelta"]> = {
  wind_gate: {
    label: "Cross-breeze path opens",
    estimatedChangePct: 12,
    tier: "prototype_visualisation",
  },
  soft_screen: {
    label: "Entry rush softens",
    estimatedChangePct: -8,
    tier: "prototype_visualisation",
  },
  wood_anchor: {
    label: "Corner pressure steadies",
    estimatedChangePct: 4,
    tier: "prototype_visualisation",
  },
  solar_shield: {
    label: "West-sun edge cools",
    estimatedChangePct: -10,
    tier: "prototype_visualisation",
  },
  fan_anchor: {
    label: "Marginal airflow gets a lift",
    estimatedChangePct: 15,
    tier: "prototype_visualisation",
  },
  shaft_buffer: {
    label: "Pipeshaft jet deflects",
    estimatedChangePct: -18,
    tier: "prototype_visualisation",
  },
};

const CURRENT_BREATH_DELTA: GhostFuture["breathDelta"] = {
  label: "Current path holds",
  estimatedChangePct: 0,
  tier: "heuristic_estimate",
};

const TOKEN_PRIORITY: TokenPlacement["tokenId"][] = [
  "shaft_buffer",
  "wind_gate",
  "fan_anchor",
  "solar_shield",
  "soft_screen",
  "wood_anchor",
];

export interface GhostFuturesInput {
  plan: PlanGeometry;
  compassDeg: number;
  floor: number;
  placements: TokenPlacement[];
}

export function previewGhostFuture(input: GhostFutureInput): GhostFuture {
  const placementResult = validateTokenPlacement(input.plan, input.candidate);
  const base = {
    tokenId: input.candidate.tokenId,
    allowed: placementResult.allowed,
    code: placementResult.code,
    breathDelta: BREATH_DELTAS[input.candidate.tokenId],
    breathCopy: formatBreathCopy(BREATH_DELTAS[input.candidate.tokenId]),
    alternatives: placementResult.alternatives,
  };

  if (!placementResult.allowed) {
    return {
      ...base,
      preview: placementResult.message,
      dampBandCopy: currentDampBandCopy(input),
    };
  }

  const before = runScoutPass({
    plan: input.plan,
    compassDeg: input.compassDeg,
    floor: input.floor,
    tokenPlacements: input.placements,
  });
  const after = runScoutPass({
    plan: input.plan,
    compassDeg: input.compassDeg,
    floor: input.floor,
    tokenPlacements: [...input.placements, input.candidate],
  });
  const dampDelta = strongestDampDelta(before.dampRisk, after.dampRisk);

  return {
    ...base,
    preview: dampDelta
      ? `${base.breathDelta.label}. ${formatRoom(dampDelta.roomId)} Damp Risk moves ${formatBand(dampDelta.beforeBand)} to ${formatBand(dampDelta.afterBand)}.`
      : `${base.breathDelta.label}. Damp Risk band stays unchanged.`,
    dampDelta,
    dampBandCopy: dampDelta
      ? `${formatRoom(dampDelta.roomId)} Damp Risk moves ${formatBand(dampDelta.beforeBand)} to ${formatBand(dampDelta.afterBand)}.`
      : currentDampBandCopy(input),
  };
}

export function previewGhostFutures(input: GhostFuturesInput): GhostFuture[] {
  const current = previewCurrentFuture(input);
  const recommended = firstViableFuture(input, new Set(), "A", "recommended");
  const used = new Set<TokenPlacement["tokenId"]>();
  if (recommended?.tokenId) used.add(recommended.tokenId);
  const alternate = firstViableFuture(input, used, "C", "alternate");

  return [recommended, current, alternate].filter((future): future is GhostFuture => Boolean(future)).slice(0, 3);
}

function previewCurrentFuture(input: GhostFuturesInput): GhostFuture {
  return {
    slot: "B",
    role: "current",
    tokenId: null,
    allowed: true,
    code: "ok",
    preview: `Current placement set. ${currentDampBandCopy(input)}`,
    breathDelta: CURRENT_BREATH_DELTA,
    breathCopy: formatBreathCopy(CURRENT_BREATH_DELTA),
    dampBandCopy: currentDampBandCopy(input),
    alternatives: [],
  };
}

function firstViableFuture(
  input: GhostFuturesInput,
  exclude: Set<TokenPlacement["tokenId"]>,
  slot: GhostFutureSlot,
  role: Exclude<GhostFutureRole, "current" | "candidate">,
): GhostFuture | null {
  const alreadyPlaced = new Set(input.placements.map((placement) => placement.tokenId));
  for (const tokenId of rankedTokenIds(input)) {
    if (exclude.has(tokenId) || alreadyPlaced.has(tokenId)) continue;
    const candidate = candidateForToken(input.plan, tokenId);
    const future = previewGhostFuture({ ...input, candidate });
    if (future.allowed) return { ...future, slot, role };
  }

  return null;
}

function rankedTokenIds(input: GhostFuturesInput): TokenPlacement["tokenId"][] {
  const scout = runScoutPass({
    plan: input.plan,
    compassDeg: input.compassDeg,
    floor: input.floor,
    tokenPlacements: input.placements,
  });
  const hasDampWatch = scout.dampRisk.some((reading) => rankBand(reading.band) > 0);
  const dampFirst = hasDampWatch ? TOKEN_PRIORITY : TOKEN_PRIORITY.filter((tokenId) => tokenId !== "shaft_buffer");
  return [...dampFirst, ...TOKEN_PRIORITY.filter((tokenId) => !dampFirst.includes(tokenId))];
}

function candidateForToken(plan: PlanGeometry, tokenId: TokenPlacement["tokenId"]): TokenPlacement {
  if (tokenId === "shaft_buffer") {
    return { tokenId, point: plan.pipeshaft.openingPoint };
  }

  const roomKindByToken: Partial<Record<TokenPlacement["tokenId"], PlanGeometry["rooms"][number]["kind"]>> = {
    wind_gate: "living",
    fan_anchor: "corridor",
    solar_shield: "living",
    soft_screen: "entry",
    wood_anchor: "bedroom",
  };
  const roomKind = roomKindByToken[tokenId] ?? "living";
  const room = plan.rooms.find((candidate) => candidate.kind === roomKind) ?? plan.rooms[0];

  return {
    tokenId,
    point: {
      x: room.x + room.width / 2,
      y: room.y + room.height / 2,
    },
  };
}

function strongestDampDelta(
  before: ReturnType<typeof runScoutPass>["dampRisk"],
  after: ReturnType<typeof runScoutPass>["dampRisk"],
): GhostFuture["dampDelta"] {
  const afterByRoom = new Map(after.map((reading) => [reading.roomId, reading]));
  const changed = before
    .map((beforeReading) => {
      const afterReading = afterByRoom.get(beforeReading.roomId);
      if (!afterReading) return undefined;
      if (rankBand(afterReading.band) >= rankBand(beforeReading.band)) return undefined;
      return {
        roomId: beforeReading.roomId,
        beforeBand: beforeReading.band,
        afterBand: afterReading.band,
        label: "Damp Risk band improves with this token.",
        tier: "heuristic_estimate" as const,
      };
    })
    .filter((reading): reading is NonNullable<typeof reading> => Boolean(reading));

  return changed.reduce<GhostFuture["dampDelta"]>((best, reading) => {
    if (!best) return reading;
    return rankBand(reading.beforeBand) - rankBand(reading.afterBand) >
      rankBand(best.beforeBand) - rankBand(best.afterBand)
      ? reading
      : best;
  }, undefined);
}

function currentDampBandCopy(input: GhostFuturesInput): string {
  const scout = runScoutPass({
    plan: input.plan,
    compassDeg: input.compassDeg,
    floor: input.floor,
    tokenPlacements: input.placements,
  });
  const reading = strongestDampReading(scout.dampRisk);
  if (!reading) return "Damp Risk band holds steady.";
  return `${formatRoom(reading.roomId)} Damp Risk holds at ${formatBand(reading.band)}.`;
}

function strongestDampReading(
  readings: ReturnType<typeof runScoutPass>["dampRisk"],
): ReturnType<typeof runScoutPass>["dampRisk"][number] | undefined {
  return readings.reduce<ReturnType<typeof runScoutPass>["dampRisk"][number] | undefined>((best, reading) => {
    if (!best) return reading;
    return rankBand(reading.band) > rankBand(best.band) ? reading : best;
  }, undefined);
}

function formatBreathCopy(delta: GhostFuture["breathDelta"]): string {
  const pct = delta.estimatedChangePct > 0 ? `+${delta.estimatedChangePct}%` : `${delta.estimatedChangePct}%`;
  return `${delta.label} (${pct}).`;
}

function rankBand(band: DampRiskBand): number {
  return { clear: 0, watch: 1, high: 2 }[band];
}

function formatBand(band: DampRiskBand): string {
  return band.charAt(0).toUpperCase() + band.slice(1);
}

function formatRoom(roomId: string): string {
  return roomId
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
