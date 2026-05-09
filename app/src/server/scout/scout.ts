import type { PlanGeometry } from "@/server/geometry/types";
import { evaluateBathroomDownwind } from "@/server/rules/downwind";
import { evaluateOpeningArea, type OpeningAreaBadge } from "@/server/rules/openingArea";
import type { TokenPlacement } from "@/server/rules/tokens";

export interface ScoutInput {
  plan: PlanGeometry;
  compassDeg: number;
  floor: number;
  tokenPlacements: TokenPlacement[];
}

export interface AskingPoint {
  id: string;
  scout: "breath" | "glow" | "quiet" | "damp";
  copy: string;
  designerDetail: string;
  recommendation?: string;
}

export interface DampRiskReading {
  roomId: string;
  predictedRhPct: number;
  thresholdPct: 75;
  flag: "clear" | "high";
  recommendation: string;
}

export interface ScoutPassResult {
  askingPoints: AskingPoint[];
  dampRisk: DampRiskReading[];
  openingAreaBadge: OpeningAreaBadge;
}

export function runScoutPass(input: ScoutInput): ScoutPassResult {
  const dampRisk = estimateDampRisk(input.plan, input.tokenPlacements);
  const openingAreaBadge = evaluateOpeningArea(input.plan);
  const bathroomDownwind = evaluateBathroomDownwind(input.plan, input.compassDeg);
  const askingPoints: AskingPoint[] = [];

  if (openingAreaBadge.status === "marginal") {
    askingPoints.push({
      id: "breath-opening-marginal",
      scout: "breath",
      copy: "Main path wants help moving air.",
      designerDetail: `Opening area is ${openingAreaBadge.areaPct}%, below the 12% capable badge. ${openingAreaBadge.recommendation}`,
      recommendation: openingAreaBadge.recommendation,
    });
  }

  if (isWestSunExposed(input.plan.westSunFacadeDeg, input.compassDeg)) {
    askingPoints.push({
      id: "glow-west-edge",
      scout: "glow",
      copy: "West edge carrying heat.",
      designerDetail: `Facade ${input.plan.westSunFacadeDeg}deg aligns with afternoon west-sun exposure.`,
    });
  }

  const highDamp = dampRisk.find((reading) => reading.flag === "high");
  if (highDamp) {
    askingPoints.push({
      id: `damp-${highDamp.roomId}`,
      scout: "damp",
      copy: "Pillow-level humidity wants a buffer.",
      designerDetail: `Predicted RH at pillow level: ${highDamp.predictedRhPct}%. ${highDamp.recommendation}`,
    });
  }

  if (bathroomDownwind) {
    askingPoints.push({
      id: bathroomDownwind.id,
      scout: "breath",
      copy: "Bathroom air path may drift toward a bedroom.",
      designerDetail: `${bathroomDownwind.bathroomLabel} sits downwind toward ${bathroomDownwind.roomLabel} on the ${bathroomDownwind.downwindDeg}deg breeze line. ${bathroomDownwind.recommendation}`,
      recommendation: bathroomDownwind.recommendation,
    });
  }

  if (input.plan.pipeshaft.downwindRoomIds.length > 0) {
    askingPoints.push({
      id: "breath-pipeshaft-drift",
      scout: "breath",
      copy: "Bedroom downwind of pipeshaft.",
      designerDetail: `Pipeshaft drift path reaches ${input.plan.pipeshaft.downwindRoomIds.join(", ")}.`,
    });
  }

  return {
    askingPoints: askingPoints.slice(0, 3),
    dampRisk,
    openingAreaBadge,
  };
}

function estimateDampRisk(plan: PlanGeometry, tokenPlacements: TokenPlacement[]): DampRiskReading[] {
  const hasShaftBuffer = tokenPlacements.some((placement) => placement.tokenId === "shaft_buffer");
  const shaftPenalty = hasShaftBuffer ? -5 : 0;

  return plan.rooms
    .filter((room) => room.kind === "bedroom")
    .map((room) => {
      const downwindPenalty = plan.pipeshaft.downwindRoomIds.includes(room.id) ? 3 : 0;
      const predictedRhPct = 75 + downwindPenalty + shaftPenalty;
      const flag = predictedRhPct >= 75 ? "high" : "clear";
      return {
        roomId: room.id,
        predictedRhPct,
        thresholdPct: 75,
        flag,
        recommendation:
          flag === "high"
            ? "Place a Shaft Buffer, move the bed away from the pipeshaft path, or run bathroom exhaust on a timer."
            : "Keep the current buffer and bathroom exhaust habit.",
      };
    });
}

function isWestSunExposed(facadeDeg: number, compassDeg: number): boolean {
  const normalized = Math.abs((((facadeDeg - compassDeg + 540) % 360) - 180));
  return normalized <= 45;
}
