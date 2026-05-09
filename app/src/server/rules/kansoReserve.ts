import type { EvidenceTier } from "@/server/evidence";
import type { PlanGeometry } from "@/server/geometry/types";
import type { TokenPlacement } from "@/server/rules/tokens";

// brief Phase 1 §10/12 — Kanso Reserve is the headline metric.
// "Remove rather than place." Healthy band is >=73% empty.
//
// Computation:
//   reservePct = round(100 * (1 - occupiedFloorAreaM2 / totalFloorAreaM2))
//   totalFloorAreaM2  = sum of every room's footprint (kitchen, bathroom,
//                       corridor, shelter all count as floor; the home is
//                       the home).
//   occupiedFloorAreaM2 = sum of (a) every fixed element bounding rect
//                       and (b) one ~1.13 m^2 disc per placed token
//                       (0.6 m radius = the same clearance the brief uses
//                       for the Shaft Buffer footprint).
//
// Bands: >=73 healthy; 65-72 watch; <65 crowded.
// Voice: calm, asking, never severity. Numerals only when functional.

export type KansoReserveStatus = "healthy" | "watch" | "crowded";

export interface KansoReserveReading {
  reservePct: number;
  status: KansoReserveStatus;
  recommendation: string;
  tier: EvidenceTier;
}

const TOKEN_FOOTPRINT_M2 = Math.PI * 0.6 * 0.6; // ~1.131 m^2

const HEALTHY_FLOOR = 73;
const WATCH_FLOOR = 65;

export function evaluateKansoReserve(
  plan: PlanGeometry,
  tokenPlacements: TokenPlacement[],
): KansoReserveReading {
  const totalFloorAreaM2 = plan.rooms.reduce(
    (sum, room) => sum + room.width * room.height,
    0,
  );

  const fixedAreaM2 = plan.fixedElements.reduce(
    (sum, element) => sum + element.width * element.height,
    0,
  );

  const tokenAreaM2 = tokenPlacements.length * TOKEN_FOOTPRINT_M2;
  const occupiedM2 = fixedAreaM2 + tokenAreaM2;

  const ratio = totalFloorAreaM2 > 0 ? occupiedM2 / totalFloorAreaM2 : 0;
  const reservePct = Math.max(0, Math.min(100, Math.round(100 * (1 - ratio))));
  const status = bandReserve(reservePct);

  return {
    reservePct,
    status,
    recommendation: recommendationFor(status, reservePct),
    tier: "heuristic_estimate",
  };
}

function bandReserve(reservePct: number): KansoReserveStatus {
  if (reservePct >= HEALTHY_FLOOR) return "healthy";
  if (reservePct >= WATCH_FLOOR) return "watch";
  return "crowded";
}

function recommendationFor(status: KansoReserveStatus, reservePct: number): string {
  if (status === "healthy") {
    return `${reservePct}% empty. The room is breathing.`;
  }
  if (status === "watch") {
    return `${reservePct}% empty. The home asks for one less object.`;
  }
  return `${reservePct}% empty. The home is asking for less.`;
}
