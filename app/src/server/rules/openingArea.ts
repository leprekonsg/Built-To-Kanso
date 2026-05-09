import type { EvidenceTier } from "@/server/evidence";
import type { PlanGeometry } from "@/server/geometry/types";
import type { TokenId } from "@/server/rules/tokens";

const CAPABLE_OPENING_AREA_PCT = 12;

export interface OpeningAreaBadge {
  areaPct: number;
  status: "marginal" | "capable";
  recommendedTokenId: Extract<TokenId, "fan_anchor" | "wind_gate">;
  recommendation: string;
  tier: EvidenceTier;
}

export function evaluateOpeningArea(plan: PlanGeometry): OpeningAreaBadge {
  if (plan.openingAreaPct < CAPABLE_OPENING_AREA_PCT) {
    return {
      areaPct: plan.openingAreaPct,
      status: "marginal",
      recommendedTokenId: "fan_anchor",
      recommendation: "Use a Fan Anchor to keep air moving through the main path.",
      tier: "heuristic_estimate",
    };
  }

  return {
    areaPct: plan.openingAreaPct,
    status: "capable",
    recommendedTokenId: "wind_gate",
    recommendation: "Use a Wind Gate to tune the existing cross-breeze.",
    tier: "heuristic_estimate",
  };
}
