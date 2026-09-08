import type { EvidenceTier } from "@/server/evidence";
import type { PlanGeometry } from "@/server/geometry/types";
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
  code: "ok" | "black_state_blocked" | "shaft_buffer_out_of_range" | "shaft_unavailable";
  preview: string;
  breathDelta: {
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
    tier: "prototype_visualisation",
  },
  soft_screen: {
    label: "Entry rush softens",
    tier: "prototype_visualisation",
  },
  wood_anchor: {
    label: "Corner pressure steadies",
    tier: "prototype_visualisation",
  },
  solar_shield: {
    label: "West-sun edge cools",
    tier: "prototype_visualisation",
  },
  fan_anchor: {
    label: "Marginal airflow gets a lift",
    tier: "prototype_visualisation",
  },
  shaft_buffer: {
    label: "Pipeshaft jet deflects",
    tier: "prototype_visualisation",
  },
};

const CURRENT_BREATH_DELTA: GhostFuture["breathDelta"] = {
  label: "Current path holds",
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
      dampBandCopy: "Humidity effect: Not assessed.",
    };
  }

  return {
    ...base,
    preview: "This arrangement changes the illustrated path. Its physical airflow and humidity effects have not been assessed.",
    dampBandCopy: "Humidity effect: Not assessed.",
  };
}

export function previewGhostFutures(input: GhostFuturesInput): GhostFuture[] {
  const current = previewCurrentFuture();
  const recommended = firstViableFuture(input, new Set(), "A", "recommended");
  const used = new Set<TokenPlacement["tokenId"]>();
  if (recommended?.tokenId) used.add(recommended.tokenId);
  const alternate = firstViableFuture(input, used, "C", "alternate");

  return [recommended, current, alternate].filter((future): future is GhostFuture => Boolean(future)).slice(0, 3);
}

function previewCurrentFuture(): GhostFuture {
  return {
    slot: "B",
    role: "current",
    tokenId: null,
    allowed: true,
    code: "ok",
    preview: "Current placement set. Physical airflow and humidity effects: Not assessed.",
    breathDelta: CURRENT_BREATH_DELTA,
    breathCopy: formatBreathCopy(CURRENT_BREATH_DELTA),
    dampBandCopy: "Humidity effect: Not assessed.",
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
  const hasPipeshaftPath = (input.plan.pipeshaft?.downwindRoomIds.length ?? 0) > 0;
  return TOKEN_PRIORITY.filter((tokenId) => tokenId !== "shaft_buffer" || hasPipeshaftPath);
}

function candidateForToken(plan: PlanGeometry, tokenId: TokenPlacement["tokenId"]): TokenPlacement {
  if (tokenId === "shaft_buffer") {
    if (!plan.pipeshaft) throw new Error("Shaft Buffer candidate requested without verified pipeshaft geometry.");
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

function formatBreathCopy(delta: GhostFuture["breathDelta"]): string {
  return `${delta.label} in this illustration. Physical effect: Not assessed.`;
}
