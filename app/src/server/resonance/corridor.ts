import type { OpeningGeometry, PlanGeometry, Point } from "@/server/geometry/types";
import type { CrossVentCorridor } from "./types";

// Pair the two operable openings whose midpoint-to-midpoint line spans the
// largest distance — proxy for the unit's best cross-vent path.
// Azimuth: 0=N, clockwise. Tier (downstream): heuristic_estimate.
export function computeCrossVentCorridor(plan: PlanGeometry): CrossVentCorridor | null {
  const operable = plan.openings.filter((opening) => opening.operable);

  if (operable.length < 2) {
    return null;
  }

  let best: { a: OpeningGeometry; b: OpeningGeometry; spanM: number; tieKey: string } | null = null;

  for (let i = 0; i < operable.length; i += 1) {
    for (let j = i + 1; j < operable.length; j += 1) {
      const [a, b] = orderOpenings(operable[i], operable[j]);
      const midA = midpoint(a);
      const midB = midpoint(b);
      const spanM = distance(midA, midB);
      const tieKey = `${a.id}\u0000${b.id}`;

      if (!best || spanM > best.spanM || (spanM === best.spanM && tieKey < best.tieKey)) {
        best = { a, b, spanM, tieKey };
      }
    }
  }

  if (!best) {
    return null;
  }

  const azimuthDeg = bearingDeg(midpoint(best.a), midpoint(best.b));

  return {
    azimuthDeg,
    openingIds: [best.a.id, best.b.id],
    spanM: best.spanM,
  };
}

function midpoint(opening: OpeningGeometry): Point {
  return {
    x: (opening.start.x + opening.end.x) / 2,
    y: (opening.start.y + opening.end.y) / 2,
  };
}

function distance(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function orderOpenings(a: OpeningGeometry, b: OpeningGeometry): [OpeningGeometry, OpeningGeometry] {
  return a.id <= b.id ? [a, b] : [b, a];
}

// Bearing in degrees (0 = N, clockwise) from `from` to `to`.
// Plan-coordinate convention used elsewhere: y axis points south on the page,
// so a +y vector is bearing 180. atan2(dx, -dy) gives the right rotation.
function bearingDeg(from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const rad = Math.atan2(dx, -dy);
  const deg = (rad * 180) / Math.PI;
  return (deg + 360) % 360;
}
