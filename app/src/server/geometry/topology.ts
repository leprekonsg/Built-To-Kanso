import type { GeometryValidationResult, OpeningGeometry, PlanGeometry, Rect } from "./types";

export const GEOMETRY_TOLERANCE_M = 0.01;
export const GEOMETRY_AREA_TOLERANCE_M2 = GEOMETRY_TOLERANCE_M * GEOMETRY_TOLERANCE_M;

function overlapArea(a: Rect, b: Rect): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return Math.max(0, width) * Math.max(0, height);
}

function openingOnRoomBoundary(opening: OpeningGeometry, room: Rect, tolerance: number): boolean {
  const points = [opening.start, opening.end];
  const onVerticalEdge = (x: number) =>
    points.every((point) => Math.abs(point.x - x) <= tolerance && point.y >= room.y - tolerance && point.y <= room.y + room.height + tolerance);
  const onHorizontalEdge = (y: number) =>
    points.every((point) => Math.abs(point.y - y) <= tolerance && point.x >= room.x - tolerance && point.x <= room.x + room.width + tolerance);
  return onVerticalEdge(room.x) || onVerticalEdge(room.x + room.width) || onHorizontalEdge(room.y) || onHorizontalEdge(room.y + room.height);
}

export function validatePlanTopology(
  plan: PlanGeometry,
  toleranceM = GEOMETRY_TOLERANCE_M,
): GeometryValidationResult {
  const issues: string[] = [];
  const areaTolerance = toleranceM * toleranceM;

  for (const room of plan.rooms) {
    if (
      room.x < plan.bounds.x - toleranceM ||
      room.y < plan.bounds.y - toleranceM ||
      room.x + room.width > plan.bounds.x + plan.bounds.width + toleranceM ||
      room.y + room.height > plan.bounds.y + plan.bounds.height + toleranceM
    ) {
      issues.push(`Room "${room.id}" extends outside plan bounds.`);
    }
  }

  for (let left = 0; left < plan.rooms.length; left += 1) {
    for (let right = left + 1; right < plan.rooms.length; right += 1) {
      const a = plan.rooms[left];
      const b = plan.rooms[right];
      const area = overlapArea(a, b);
      if (area > areaTolerance) {
        issues.push(`Rooms "${a.id}" and "${b.id}" overlap by ${area.toFixed(4)} m².`);
      }
    }
  }

  const rooms = new Map(plan.rooms.map((room) => [room.id, room]));
  for (const opening of plan.openings) {
    for (const roomId of opening.roomIds) {
      const room = rooms.get(roomId);
      if (room && !openingOnRoomBoundary(opening, room, toleranceM)) {
        issues.push(`Opening "${opening.id}" is not on the boundary of declared room "${roomId}" within ${toleranceM} m tolerance.`);
      }
    }
    if (opening.kind === "door" && opening.roomIds.length > 2) {
      issues.push(`Door "${opening.id}" may connect at most two declared rooms.`);
    }
  }

  return { ok: issues.length === 0, issues };
}
