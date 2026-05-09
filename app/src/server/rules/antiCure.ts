import type { EvidenceTier } from "@/server/evidence";
import type { PlanGeometry, RoomGeometry } from "@/server/geometry/types";
import type { ScoutPassResult } from "@/server/scout/scout";

// brief Phase 1 §11 — Anti-Cure is a first-class recommendation.
// "Leave one corner unbuilt for ninety days." Calm voice; spell ninety.
//
// Eligibility:
//   - Prefer living or study rooms.
//   - Skip bedrooms downwind of the pipeshaft (the home is already asking
//     about damp risk there).
//   - Skip rooms on the west-sun facade (they carry their own heat ask).
//   - Skip any room already named in an asking point (no double-asking).
//
// If multiple candidates remain, pick the one with the largest footprint;
// that is the corner with the most room to leave alone.

export type AntiCureRoomKind = RoomGeometry["kind"];

export interface AntiCureReading {
  roomId: string;
  label: string;
  recommendation: string;
  tier: EvidenceTier;
}

const PREFERRED_KINDS: ReadonlyArray<AntiCureRoomKind> = ["living"];

const RECOMMENDATION = "One corner the home is asking you not to fill for ninety days.";

export function recommendAntiCure(
  plan: PlanGeometry,
  scout: ScoutPassResult,
): AntiCureReading | null {
  const downwindRoomIds = new Set(plan.pipeshaft.downwindRoomIds);
  const askingRoomIds = collectAskingRoomIds(plan, scout);

  const eligible = plan.rooms.filter((room) => {
    if (!PREFERRED_KINDS.includes(room.kind)) return false;
    if (downwindRoomIds.has(room.id)) return false;
    if (isWestSunRoom(room, plan)) return false;
    if (askingRoomIds.has(room.id)) return false;
    return true;
  });

  if (eligible.length === 0) return null;

  const largest = eligible.reduce((best, room) =>
    room.width * room.height > best.width * best.height ? room : best,
  );

  return {
    roomId: largest.id,
    label: largest.label,
    recommendation: RECOMMENDATION,
    tier: "heuristic_estimate",
  };
}

function collectAskingRoomIds(plan: PlanGeometry, scout: ScoutPassResult): Set<string> {
  const ids = new Set<string>();
  for (const reading of scout.dampRisk) {
    if (reading.band !== "clear") ids.add(reading.roomId);
  }
  for (const point of scout.askingPoints) {
    // asking-point ids of the form "damp-<roomId>" carry a roomId suffix.
    const dampMatch = point.id.match(/^damp-(.+)$/);
    if (dampMatch) ids.add(dampMatch[1]);
  }
  for (const id of plan.pipeshaft.downwindRoomIds) ids.add(id);
  return ids;
}

// A room sits on the west-sun facade if its west edge (smallest x) hugs the
// plan's west bound. The brief's tropical inversion treats the 16:00-18:30
// load as the worst exposure; that wall is already asking, so it cannot also
// be the anti-cure corner.
function isWestSunRoom(room: RoomGeometry, plan: PlanGeometry): boolean {
  const facadeIsWest = Math.abs(((plan.westSunFacadeDeg % 360) + 360) % 360 - 270) <= 22.5;
  if (!facadeIsWest) return false;
  const tolerance = 0.2;
  return Math.abs(room.x - plan.bounds.x) <= tolerance;
}
