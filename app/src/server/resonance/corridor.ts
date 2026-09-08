import type { OpeningGeometry, PlanGeometry, Point } from "@/server/geometry/types";
import type { CrossVentCorridor } from "./types";

// V1 treats a one-room opening as exterior-facing and a two-room opening as an
// internal connection. It returns an undirected geometric axis (0 <= deg < 180),
// never an inferred inlet/outlet direction.
export function computeCrossVentCorridor(plan: PlanGeometry): CrossVentCorridor | null {
  const exterior = plan.openings.filter((opening) => opening.operable && opening.roomIds.length === 1);
  const connected = connectedRooms(plan.openings);
  let best: { a: OpeningGeometry; b: OpeningGeometry; spanM: number; geometryKey: string } | null = null;

  for (let i = 0; i < exterior.length; i += 1) {
    for (let j = i + 1; j < exterior.length; j += 1) {
      if (!areConnected(exterior[i].roomIds[0], exterior[j].roomIds[0], connected)) continue;
      const [a, b] = orderByGeometry(exterior[i], exterior[j]);
      const spanM = distance(midpoint(a), midpoint(b));
      const geometryKey = `${pointKey(midpoint(a))}|${pointKey(midpoint(b))}`;
      if (!best || spanM > best.spanM || (spanM === best.spanM && geometryKey < best.geometryKey)) {
        best = { a, b, spanM, geometryKey };
      }
    }
  }

  if (!best) return null;
  return { azimuthDeg: axisDeg(midpoint(best.a), midpoint(best.b)), openingIds: [best.a.id, best.b.id], spanM: best.spanM };
}

function connectedRooms(openings: OpeningGeometry[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  for (const opening of openings) {
    if (!opening.operable || opening.roomIds.length !== 2) continue;
    const [a, b] = opening.roomIds;
    if (!graph.has(a)) graph.set(a, new Set());
    if (!graph.has(b)) graph.set(b, new Set());
    graph.get(a)?.add(b);
    graph.get(b)?.add(a);
  }
  return graph;
}

function areConnected(a: string, b: string, graph: Map<string, Set<string>>): boolean {
  if (a === b) return true;
  const seen = new Set([a]);
  const queue = [a];
  while (queue.length) {
    const current = queue.shift() as string;
    for (const next of graph.get(current) ?? []) {
      if (next === b) return true;
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  return false;
}

function midpoint(opening: OpeningGeometry): Point {
  return { x: (opening.start.x + opening.end.x) / 2, y: (opening.start.y + opening.end.y) / 2 };
}
function distance(a: Point, b: Point): number { return Math.hypot(b.x - a.x, b.y - a.y); }
function pointKey(point: Point): string { return `${point.y.toFixed(9)},${point.x.toFixed(9)}`; }
function orderByGeometry(a: OpeningGeometry, b: OpeningGeometry): [OpeningGeometry, OpeningGeometry] {
  return pointKey(midpoint(a)) <= pointKey(midpoint(b)) ? [a, b] : [b, a];
}
function axisDeg(from: Point, to: Point): number {
  const bearing = ((Math.atan2(to.x - from.x, -(to.y - from.y)) * 180) / Math.PI + 360) % 360;
  return bearing >= 180 ? bearing - 180 : bearing;
}
