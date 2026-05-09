import type { EvidenceTier } from "@/server/evidence";
import type { OpeningGeometry, PlanGeometry, Point } from "@/server/geometry/types";
import type { TokenId } from "@/server/rules/tokens";
import type { AskingPoint } from "@/server/scout/scout";

export type GlowBand = "settled" | "shade";

export interface GlowInput {
  plan: PlanGeometry;
  compassDeg: number;
  floor: number;
}

export interface WestSunWindow {
  start: "16:00";
  end: "18:30";
  timezone: "Asia/Singapore";
}

export interface GlowReading {
  band: GlowBand;
  solarWashScore: number;
  westSunWindow: WestSunWindow;
  targetShgcMax: 0.3;
  exposedWindowLengthM: number;
  exposureRatio: number;
  orientationDeltaDeg: number;
  floorFactor: number;
  recommendedTokenId: Extract<TokenId, "solar_shield">;
  culturalSummary: string;
  designerSummary: string;
  askingPoints: AskingPoint[];
  tier: EvidenceTier;
}

const WEST_SUN_WINDOW: WestSunWindow = {
  start: "16:00",
  end: "18:30",
  timezone: "Asia/Singapore",
};

const TARGET_SHGC_MAX = 0.3;
const GLOW_ASK_SCORE = 35;
const HIGH_WINDOW_EXPOSURE_M = 2;
const UPPER_FLOOR = 13;

export function evaluateGlow(input: GlowInput): GlowReading {
  const orientationDeltaDeg = angleDistance(input.plan.westSunFacadeDeg, input.compassDeg);
  const orientationFactor = orientationDeltaDeg <= 90 ? 1 - orientationDeltaDeg / 90 : 0;
  const floorFactor = factorForFloor(input.floor);
  const exposedWindowLengthM = round1(exposedWindowLength(input.plan));
  const facadeLengthM = facadeLength(input.plan);
  const exposureRatio = facadeLengthM > 0 ? round2(exposedWindowLengthM / facadeLengthM) : 0;
  const windowFactor = orientationFactor === 0 ? 0 : Math.min(1.25, 0.45 + exposureRatio * 0.9);
  const solarWashScore = Math.max(0, Math.min(100, Math.round(100 * orientationFactor * floorFactor * windowFactor)));
  const band: GlowBand = solarWashScore >= GLOW_ASK_SCORE ? "shade" : "settled";
  const askingPoints = buildAskingPoints({
    plan: input.plan,
    floor: input.floor,
    solarWashScore,
    exposedWindowLengthM,
    exposureRatio,
    orientationDeltaDeg,
  });

  return {
    band,
    solarWashScore,
    westSunWindow: WEST_SUN_WINDOW,
    targetShgcMax: TARGET_SHGC_MAX,
    exposedWindowLengthM,
    exposureRatio,
    orientationDeltaDeg,
    floorFactor,
    recommendedTokenId: "solar_shield",
    culturalSummary:
      band === "shade"
        ? "Afternoon edge asks for shade first."
        : "No west-edge heat ask on this compass read.",
    designerSummary:
      `${WEST_SUN_WINDOW.start}-${WEST_SUN_WINDOW.end} SGT, score ${solarWashScore}/100, ` +
      `facade ${input.plan.westSunFacadeDeg}deg, floor ${input.floor}, ` +
      `exposed window ${formatNumber(exposedWindowLengthM)}m, SHGC <=0.30.`,
    askingPoints,
    tier: "heuristic_estimate",
  };
}

function buildAskingPoints(input: {
  plan: PlanGeometry;
  floor: number;
  solarWashScore: number;
  exposedWindowLengthM: number;
  exposureRatio: number;
  orientationDeltaDeg: number;
}): AskingPoint[] {
  const points: AskingPoint[] = [];

  if (input.solarWashScore >= GLOW_ASK_SCORE) {
    points.push({
      id: "glow-west-edge",
      scout: "glow",
      copy: "West edge carrying heat.",
      designerDetail:
        `16:00-18:30 SGT solar wash score ${input.solarWashScore}/100. ` +
        `Facade ${input.plan.westSunFacadeDeg}deg, orientation delta ${Math.round(input.orientationDeltaDeg)}deg. ` +
        "Use SHGC <=0.30 before adding heavy objects.",
      recommendation: "Use Solar Shield: SHGC <=0.30 film, sheer layer, or light shelf.",
      tier: "heuristic_estimate",
    });
  }

  if (input.solarWashScore > 0 && input.exposedWindowLengthM >= HIGH_WINDOW_EXPOSURE_M) {
    points.push({
      id: "glow-window-exposure",
      scout: "glow",
      copy: "Long window line wants light shade.",
      designerDetail:
        `Exposed west-window length ${formatNumber(input.exposedWindowLengthM)}m, ` +
        `facade ratio ${Math.round(input.exposureRatio * 100)}%.`,
      recommendation: "Keep shade close to the glass and leave the sill clear.",
      tier: "heuristic_estimate",
    });
  }

  if (input.solarWashScore > 0 && input.floor >= UPPER_FLOOR) {
    points.push({
      id: "glow-upper-floor",
      scout: "glow",
      copy: "Higher floor gets less borrowed shade.",
      designerDetail: `Floor ${input.floor}; conservative upper-floor multiplier applied to the solar wash estimate.`,
      recommendation: "Pair Solar Shield with a breathable curtain layer.",
      tier: "heuristic_estimate",
    });
  }

  return points.slice(0, 3);
}

function exposedWindowLength(plan: PlanGeometry): number {
  return plan.openings
    .filter((opening) => (opening.kind === "window" || opening.kind === "louver") && isOnWestSunFacade(plan, opening))
    .reduce((sum, opening) => sum + distance(opening.start, opening.end), 0);
}

function isOnWestSunFacade(plan: PlanGeometry, opening: OpeningGeometry): boolean {
  const edge = nearestCardinalEdge(plan.westSunFacadeDeg);
  const midpoint = midpointOf(opening.start, opening.end);
  const toleranceM = 0.35;

  if (edge === "west") return Math.abs(midpoint.x - plan.bounds.x) <= toleranceM;
  if (edge === "east") return Math.abs(midpoint.x - (plan.bounds.x + plan.bounds.width)) <= toleranceM;
  if (edge === "north") return Math.abs(midpoint.y - plan.bounds.y) <= toleranceM;
  return Math.abs(midpoint.y - (plan.bounds.y + plan.bounds.height)) <= toleranceM;
}

function nearestCardinalEdge(deg: number): "north" | "east" | "south" | "west" {
  const normalized = normalizeDeg(deg);
  const edges = [
    { edge: "north" as const, deg: 0 },
    { edge: "east" as const, deg: 90 },
    { edge: "south" as const, deg: 180 },
    { edge: "west" as const, deg: 270 },
  ];
  return edges.reduce((nearest, candidate) =>
    angleDistance(normalized, candidate.deg) < angleDistance(normalized, nearest.deg) ? candidate : nearest,
  ).edge;
}

function facadeLength(plan: PlanGeometry): number {
  const edge = nearestCardinalEdge(plan.westSunFacadeDeg);
  return edge === "west" || edge === "east" ? plan.bounds.height : plan.bounds.width;
}

function factorForFloor(floor: number): number {
  if (floor <= 3) return 0.85;
  if (floor < UPPER_FLOOR) return 1;
  return 1.15;
}

function midpointOf(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function angleDistance(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
