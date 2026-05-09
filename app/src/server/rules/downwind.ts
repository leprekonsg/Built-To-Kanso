import type { BathroomGeometry, PlanGeometry, Point, RoomGeometry } from "@/server/geometry/types";

const MONSOON_AXES_DEG = [45, 225] as const;
const MONSOON_SNAP_DEG = 35;
const DOWNWIND_DOT_MIN = 0.65;
const MAX_BATHROOM_TO_BEDROOM_M = 5.5;

export interface BathroomDownwindRecommendation {
  id: string;
  bathroomId: string;
  bathroomLabel: string;
  roomId: string;
  roomLabel: string;
  downwindDeg: number;
  recommendation: string;
}

export function evaluateBathroomDownwind(
  plan: PlanGeometry,
  compassDeg: number,
): BathroomDownwindRecommendation | undefined {
  const bedrooms = plan.rooms.filter((room) => room.kind === "bedroom");
  const downwindDeg = monsoonAwareDownwindDeg(compassDeg);
  const downwindVector = vectorFromCompassDeg(downwindDeg);

  let best: { score: number; bathroom: BathroomGeometry; bathroomRoom: RoomGeometry; bedroom: RoomGeometry } | undefined;

  for (const bathroom of plan.bathrooms) {
    const bathroomRoom = plan.rooms.find((room) => room.id === bathroom.roomId);
    if (!bathroomRoom) continue;

    for (const bedroom of bedrooms) {
      const toBedroom = normalize(vectorBetween(bathroom.exhaustPoint, centerOf(bedroom)));
      if (!toBedroom) continue;

      const distanceM = distance(bathroom.exhaustPoint, centerOf(bedroom));
      if (distanceM > MAX_BATHROOM_TO_BEDROOM_M) continue;

      const alignment = dot(downwindVector, toBedroom);
      if (alignment < DOWNWIND_DOT_MIN) continue;

      const score = alignment / distanceM;
      if (!best || score > best.score) {
        best = { score, bathroom, bathroomRoom, bedroom };
      }
    }
  }

  if (!best) return undefined;

  return {
    id: `bathroom-downwind-${best.bathroom.roomId}-${best.bedroom.id}`,
    bathroomId: best.bathroom.roomId,
    bathroomLabel: best.bathroomRoom.label,
    roomId: best.bedroom.id,
    roomLabel: best.bedroom.label,
    downwindDeg,
    recommendation: "Run bathroom exhaust on a timer and keep the bedroom door path lightly buffered.",
  };
}

function monsoonAwareDownwindDeg(compassDeg: number): number {
  const normalized = normalizeDeg(compassDeg);
  const nearestAxis = MONSOON_AXES_DEG.reduce((nearest, axis) =>
    angleDistance(normalized, axis) < angleDistance(normalized, nearest) ? axis : nearest,
  );

  return angleDistance(normalized, nearestAxis) <= MONSOON_SNAP_DEG ? nearestAxis : normalized;
}

function vectorFromCompassDeg(deg: number): Point {
  const radians = (deg * Math.PI) / 180;
  return { x: Math.sin(radians), y: -Math.cos(radians) };
}

function centerOf(room: RoomGeometry): Point {
  return {
    x: room.x + room.width / 2,
    y: room.y + room.height / 2,
  };
}

function vectorBetween(from: Point, to: Point): Point {
  return { x: to.x - from.x, y: to.y - from.y };
}

function normalize(vector: Point): Point | undefined {
  const length = Math.hypot(vector.x, vector.y);
  if (length === 0) return undefined;
  return { x: vector.x / length, y: vector.y / length };
}

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
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
