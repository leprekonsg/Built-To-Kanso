import type { OpeningGeometry, PlanGeometry, Point } from "@/server/geometry/types";
import type { GlowReading } from "./glow";

export interface GlowWashPolygon {
  id: string;
  points: [Point, Point, Point, Point];
  opacity: number;
}

export function buildGlowWashPolygons(plan: PlanGeometry, glow: GlowReading): GlowWashPolygon[] {
  if (glow.solarWashScore <= 0) return [];
  const edge = nearestCardinalEdge(plan.westSunFacadeDeg);
  const depthM = 0.85;
  const opacity = 0.08 + Math.min(0.24, glow.solarWashScore / 100 / 4);

  return plan.openings
    .filter((opening) => (opening.kind === "window" || opening.kind === "louver") && isOnFacade(plan, opening, edge))
    .map((opening) => ({
      id: opening.id,
      points: washPolygonFor(opening, edge, depthM),
      opacity,
    }));
}

function washPolygonFor(opening: OpeningGeometry, edge: "north" | "east" | "south" | "west", depthM: number): [Point, Point, Point, Point] {
  const dx = edge === "west" ? depthM : edge === "east" ? -depthM : 0;
  const dy = edge === "north" ? depthM : edge === "south" ? -depthM : 0;
  return [
    { x: roundPoint(opening.start.x), y: roundPoint(opening.start.y) },
    { x: roundPoint(opening.end.x), y: roundPoint(opening.end.y) },
    { x: roundPoint(opening.end.x + dx), y: roundPoint(opening.end.y + dy) },
    { x: roundPoint(opening.start.x + dx), y: roundPoint(opening.start.y + dy) },
  ];
}

function isOnFacade(plan: PlanGeometry, opening: OpeningGeometry, edge: "north" | "east" | "south" | "west"): boolean {
  const mid = {
    x: (opening.start.x + opening.end.x) / 2,
    y: (opening.start.y + opening.end.y) / 2,
  };
  const toleranceM = 0.35;
  if (edge === "west") return Math.abs(mid.x - plan.bounds.x) <= toleranceM;
  if (edge === "east") return Math.abs(mid.x - (plan.bounds.x + plan.bounds.width)) <= toleranceM;
  if (edge === "north") return Math.abs(mid.y - plan.bounds.y) <= toleranceM;
  return Math.abs(mid.y - (plan.bounds.y + plan.bounds.height)) <= toleranceM;
}

function nearestCardinalEdge(deg: number): "north" | "east" | "south" | "west" {
  const normalized = ((deg % 360) + 360) % 360;
  if (normalized < 45 || normalized >= 315) return "north";
  if (normalized < 135) return "east";
  if (normalized < 225) return "south";
  return "west";
}

function roundPoint(value: number): number {
  return Math.round(value * 1000) / 1000;
}
