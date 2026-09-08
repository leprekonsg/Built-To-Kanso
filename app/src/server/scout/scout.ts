import type { EvidenceTier } from "@/server/evidence";
import type { PlanGeometry } from "@/server/geometry/types";
import { evaluateBathroomDownwind } from "@/server/rules/downwind";
import { evaluateOpeningArea, type OpeningAreaBadge } from "@/server/rules/openingArea";
import type { TokenPlacement } from "@/server/rules/tokens";
import { rankAskingPoints } from "@/server/scout/priority";

export interface ScoutInput {
  plan: PlanGeometry;
  compassDeg: number;
  windFromDeg?: number;
  floor: number;
  tokenPlacements: TokenPlacement[];
}

export interface AskingPoint {
  id: string;
  scout: "breath" | "glow" | "quiet" | "damp";
  copy: string;
  designerDetail: string;
  recommendation?: string;
  tier: EvidenceTier;
}

export type DampRiskBand = "clear" | "watch" | "high" | "not_assessed";

export interface DampRiskReading {
  roomId: string;
  band: DampRiskBand;
  recommendation: string;
  tier: EvidenceTier;
}

export interface ScoutPassResult {
  askingPoints: AskingPoint[];
  dampRisk: DampRiskReading[];
  openingAreaBadge: OpeningAreaBadge;
}

export function runScoutPass(input: ScoutInput): ScoutPassResult {
  const dampRisk = assessDampRisk(input.plan);
  const openingAreaBadge = evaluateOpeningArea(input.plan);
  const bathroomDownwind = input.windFromDeg === undefined
    ? undefined
    : evaluateBathroomDownwind(input.plan, input.windFromDeg);
  const askingPoints: AskingPoint[] = [];

  if (openingAreaBadge.status === "marginal") {
    askingPoints.push({
      id: "breath-opening-marginal",
      scout: "breath",
      copy: "Main path wants help moving air.",
      designerDetail: `Opening area is ${openingAreaBadge.areaPct}%, below the 12% capable badge. ${openingAreaBadge.recommendation}`,
      recommendation: openingAreaBadge.recommendation,
      tier: "heuristic_estimate",
    });
  }

  if (isWestSunExposed(input.plan.westSunFacadeDeg, input.compassDeg)) {
    askingPoints.push({
      id: "glow-west-edge",
      scout: "glow",
      copy: "West edge carrying heat.",
      designerDetail: `Facade ${input.plan.westSunFacadeDeg}deg aligns with afternoon west-sun exposure.`,
      tier: "heuristic_estimate",
    });
  }

  if (bathroomDownwind) {
    askingPoints.push({
      id: bathroomDownwind.id,
      scout: "breath",
      copy: "Bathroom air path may drift toward a bedroom.",
      designerDetail: `${bathroomDownwind.bathroomLabel} sits downwind toward ${bathroomDownwind.roomLabel} on the ${bathroomDownwind.downwindDeg}deg breeze line. ${bathroomDownwind.recommendation}`,
      recommendation: bathroomDownwind.recommendation,
      tier: "heuristic_estimate",
    });
  }

  if (input.plan.pipeshaft && input.plan.pipeshaft.downwindRoomIds.length > 0) {
    askingPoints.push({
      id: "breath-pipeshaft-drift",
      scout: "breath",
      copy: "Bedroom downwind of pipeshaft.",
      designerDetail: `Pipeshaft drift path reaches ${input.plan.pipeshaft.downwindRoomIds.join(", ")}.`,
      tier: "heuristic_estimate",
    });
  }

  return {
    // PRODUCT.md "calm voice over alarm": max three Asking Points,
    // ranked deterministically (see priority.ts).
    askingPoints: rankAskingPoints(askingPoints).slice(0, 3),
    dampRisk,
    openingAreaBadge,
  };
}

function assessDampRisk(plan: PlanGeometry): DampRiskReading[] {
  return plan.rooms
    .filter((room) => room.kind === "bedroom")
    .map((room) => ({
      roomId: room.id,
      band: "not_assessed",
      recommendation:
        "Humidity effect: Not assessed. Measure bedroom humidity across wet-weather and post-shower periods before drawing a damp conclusion.",
      tier: "heuristic_estimate",
    }));
}

function isWestSunExposed(facadeDeg: number, compassDeg: number): boolean {
  const normalized = Math.abs((((facadeDeg - compassDeg + 540) % 360) - 180));
  return normalized <= 45;
}
