import type { EvidenceTier } from "@/server/evidence";
import type { PlanGeometry, Point, RoomGeometry } from "@/server/geometry/types";
import { generateHouseChangelog } from "@/server/rules/changelog";
import { previewGhostFuture } from "@/server/rules/ghostFutures";
import { evaluateKansoReserve } from "@/server/rules/kansoReserve";
import { type TokenId, type TokenPlacement } from "@/server/rules/tokens";
import { recommendAntiCure } from "@/server/rules/antiCure";
import { runScoutPass, type ScoutPassResult } from "@/server/scout/scout";
import { buildTier4Simulation } from "@/server/simulation/tier4";
import type { SimulationParticle, SimulationStreamline } from "@/server/simulation/types";

export type RecommendationActionKind = "place" | "behavior" | "keep_clear";

export interface RecommendationAction {
  id: string;
  marker: "A" | "B" | "C";
  kind: RecommendationActionKind;
  tokenId: TokenId | "anti_cure";
  label: string;
  object: string;
  roomLabel: string;
  point: Point;
  copy: string;
  proof: string;
  tier: EvidenceTier;
}

export interface RecommendationProof {
  plan: PlanGeometry;
  compassDeg: number;
  floor: number;
  scout: ScoutPassResult;
  actions: RecommendationAction[];
  acceptedPlacements: TokenPlacement[];
  reservePct: number;
  changelog: string[];
  streamlines: SimulationStreamline[];
  particles: SimulationParticle[];
  simulationTier: EvidenceTier;
  source: {
    geometry: "plan-geometry.json";
    airflow: "deterministic-tier4-field";
    lifeSketch: "accepted-gpt-image-2-prebake-or-deterministic-fallback";
  };
}

const TOKEN_COPY: Record<TokenId, {
  label: string;
  object: string;
  kind: RecommendationActionKind;
  copy: string;
}> = {
  shaft_buffer: {
    label: "Shaft Buffer",
    object: "Tall cabinet or dense plant",
    kind: "place",
    copy: "Place within 0.6m of the pipeshaft door.",
  },
  fan_anchor: {
    label: "Fan Anchor",
    object: "Quiet standing fan",
    kind: "behavior",
    copy: "Aim across the marginal path from 14:00 to 19:00.",
  },
  wind_gate: {
    label: "Wind Gate",
    object: "Window-opening habit or perforated edge",
    kind: "behavior",
    copy: "Open the cross-breeze path when the corridor is aligned.",
  },
  soft_screen: {
    label: "Soft Screen",
    object: "Low woven screen",
    kind: "place",
    copy: "Soften the entry rush without blocking the path.",
  },
  wood_anchor: {
    label: "Wood Anchor",
    object: "Plant or timber mass",
    kind: "place",
    copy: "Steady the quiet corner with a small natural object.",
  },
  solar_shield: {
    label: "Solar Shield",
    object: "Light curtain, film, or light shelf",
    kind: "place",
    copy: "Cool the west edge without turning the wall into a feature.",
  },
};

export function buildRecommendationProof(input: {
  plan: PlanGeometry;
  compassDeg: number;
  floor: number;
}): RecommendationProof {
  const placements: TokenPlacement[] = [];
  const scout = runScoutPass({ ...input, tokenPlacements: placements });
  const tokenActions = rankProofTokenIds(input.plan, scout)
    .map((tokenId) => {
      const placement = candidateForToken(input.plan, tokenId);
      const future = previewGhostFuture({ ...input, placements, candidate: placement });
      return { future, placement, tokenId };
    })
    .filter(({ future }) => future.allowed)
    .slice(0, 2)
    .map(({ future, placement, tokenId }, index): RecommendationAction => {
      const room = roomForPoint(input.plan, placement.point);
      const token = TOKEN_COPY[tokenId];
      return {
        id: tokenId,
        marker: index === 0 ? "A" : "B",
        kind: token.kind,
        tokenId,
        label: token.label,
        object: token.object,
        roomLabel: room.label,
        point: placement.point,
        copy: token.copy,
        proof: future.preview,
        tier: future.breathDelta.tier,
      };
    });

  const antiCure = buildAntiCureAction(input.plan, scout, tokenActions.length);
  const actions = [...tokenActions, ...(antiCure ? [antiCure] : [])].slice(0, 3);
  const acceptedPlacements = actions
    .filter((action): action is RecommendationAction & { tokenId: TokenId } => action.tokenId !== "anti_cure")
    .map((action) => ({ tokenId: action.tokenId, point: action.point }));
  const simulation = buildTier4Simulation({
    templateId: input.plan.templateId,
    tokenPlacements: acceptedPlacements,
    candidatePositions: acceptedPlacements.slice(0, 1),
    condition: "ne_monsoon",
  });
  const reserve = evaluateKansoReserve(input.plan, acceptedPlacements);
  const changelog = generateHouseChangelog({ plan: input.plan, placements: acceptedPlacements });

  return {
    plan: input.plan,
    compassDeg: input.compassDeg,
    floor: input.floor,
    scout,
    actions,
    acceptedPlacements,
    reservePct: reserve.reservePct,
    changelog: changelog.lines,
    streamlines: input.plan.pipeshaft ? simulation.streamlines : simulation.streamlines.filter((line) => !line.id.includes("shaft")),
    particles: input.plan.pipeshaft ? simulation.particles : simulation.particles.filter((particle) => particle.kind !== "pipeshaft_drift"),
    simulationTier: simulation.tier,
    source: {
      geometry: "plan-geometry.json",
      airflow: "deterministic-tier4-field",
      lifeSketch: "accepted-gpt-image-2-prebake-or-deterministic-fallback",
    },
  };
}

function rankProofTokenIds(plan: PlanGeometry, scout: ScoutPassResult): TokenId[] {
  const ranked: TokenId[] = [];
  const hasPipeshaftPath = (plan.pipeshaft?.downwindRoomIds.length ?? 0) > 0;
  const hasWestSunAsk = scout.askingPoints.some((point) => point.id === "glow-west-edge");

  if (hasPipeshaftPath) ranked.push("shaft_buffer");
  ranked.push(scout.openingAreaBadge.status === "marginal" ? "fan_anchor" : "wind_gate");
  if (hasWestSunAsk) ranked.push("solar_shield");
  ranked.push("soft_screen", "wood_anchor", "wind_gate", "fan_anchor", "solar_shield");

  return [...new Set(ranked)];
}

function buildAntiCureAction(
  plan: PlanGeometry,
  scout: ScoutPassResult,
  existingCount: number,
): RecommendationAction | null {
  const antiCure = recommendAntiCure(plan, scout);
  if (!antiCure) return null;

  const room = plan.rooms.find((candidate) => candidate.id === antiCure.roomId);
  if (!room) return null;

  return {
    id: "anti_cure",
    marker: existingCount === 0 ? "A" : existingCount === 1 ? "B" : "C",
    kind: "keep_clear",
    tokenId: "anti_cure",
    label: "Anti-Cure",
    object: "No built-in furniture",
    roomLabel: room.label,
    point: quietCorner(room),
    copy: antiCure.recommendation,
    proof: "Kanso Reserve protects useful empty space before adding another object.",
    tier: antiCure.tier,
  };
}

function candidateForToken(plan: PlanGeometry, tokenId: TokenId): TokenPlacement {
  if (tokenId === "shaft_buffer") {
    if (!plan.pipeshaft) throw new Error("Shaft Buffer candidate requested without verified pipeshaft geometry.");
    return { tokenId, point: plan.pipeshaft.openingPoint };
  }

  const roomKindByToken: Partial<Record<TokenId, RoomGeometry["kind"]>> = {
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
      x: round(room.x + room.width / 2),
      y: round(room.y + room.height / 2),
    },
  };
}

function roomForPoint(plan: PlanGeometry, point: Point): RoomGeometry {
  return (
    plan.rooms.find(
      (room) =>
        point.x >= room.x &&
        point.x <= room.x + room.width &&
        point.y >= room.y &&
        point.y <= room.y + room.height,
    ) ?? nearestRoom(plan, point)
  );
}

function nearestRoom(plan: PlanGeometry, point: Point): RoomGeometry {
  return plan.rooms.reduce((best, room) => {
    const bestDistance = distanceToRoomCenter(best, point);
    const distance = distanceToRoomCenter(room, point);
    return distance < bestDistance ? room : best;
  }, plan.rooms[0]);
}

function distanceToRoomCenter(room: RoomGeometry, point: Point): number {
  return Math.hypot(room.x + room.width / 2 - point.x, room.y + room.height / 2 - point.y);
}

function quietCorner(room: RoomGeometry): Point {
  return {
    x: round(room.x + room.width * 0.82),
    y: round(room.y + room.height * 0.78),
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
