/**
 * Deterministic streamline extraction from a velocity field.
 *
 * The paths are deterministic illustrations derived from the prototype
 * velocity field. They do not establish measured airflow or physical benefit.
 *
 * Algorithm:
 *   1. Place ~12 seed points evenly across the inflow edge (within plan bounds).
 *   2. Integrate each seed forward with RK4, step ~0.5 cell, max 200 steps.
 *   3. Emit one SVG path per streamline as `M x y L x y L ...` in plan-meters.
 *
 * Determinism: identical (field, plan) -> identical paths. No RNG, no time.
 */

import type { PlanGeometry, Point, Rect } from "@/server/geometry/types";
import type { RawVelocityField, StreamlineSource, VelocityField } from "./types";

const DEFAULT_SEED_COUNT = 12;
const MAX_STEPS = 200;
const STEP_CELL_FRACTION = 0.5;
/** Below this lattice-unit speed we treat the cell as stagnant and stop. */
const MIN_SPEED = 1e-4;

interface Vec2 {
  x: number;
  y: number;
}

export interface ExtractedStreamline {
  points: Point[];
  source: StreamlineSource;
}

export function extractStreamlines(
  field: VelocityField,
  plan: PlanGeometry,
  count: number = DEFAULT_SEED_COUNT,
): { paths: string[] } {
  const lines = extractStreamlinePoints(field, plan, { count });
  return { paths: lines.map((line) => toSvgPath(line.points)) };
}

export function extractStreamlinePoints(
  field: VelocityField,
  plan: PlanGeometry,
  options: { count?: number; compassDeg?: number; includePipeshaftSource?: boolean } = {},
): ExtractedStreamline[] {
  const raw = field as unknown as RawVelocityField;
  const N = raw.width; // width === height per types contract
  const bounds = plan.bounds;
  const count = options.count ?? DEFAULT_SEED_COUNT;

  // Step length in plan meters. Half a cell, in the smaller of the two axes.
  const cellM = Math.min(bounds.width, bounds.height) / N;
  const stepM = cellM * STEP_CELL_FRACTION;

  const inflowEdge = pickInflowEdge(options.compassDeg ?? plan.defaultDoorFacingDeg ?? 0);
  const ordinaryCount = options.includePipeshaftSource && plan.pipeshaft ? Math.max(0, count - 1) : count;
  const seeds = seedPoints(bounds, inflowEdge, ordinaryCount);

  const lines: ExtractedStreamline[] = [];
  for (const [index, seed] of seeds.entries()) {
    const pts = integrate(raw, plan, seed, stepM);
    if (pts.length < 2) continue;
    lines.push({ points: pts, source: { kind: "boundary", edge: inflowEdge, index } });
  }

  if (lines.length < Math.min(3, count)) {
    for (const [index, seed] of interiorSeedPoints(raw, plan, count * 2).entries()) {
      const pts = integrate(raw, plan, seed, stepM);
      if (pts.length < 2) continue;
      lines.push({ points: pts, source: { kind: "interior_diagnostic", index } });
      if (lines.length >= ordinaryCount) break;
    }
  }

  if (options.includePipeshaftSource && plan.pipeshaft && lines.length < count) {
    const points = integrate(raw, plan, plan.pipeshaft.openingPoint, stepM);
    if (points.length >= 2) lines.push({ points, source: { kind: "pipeshaft", shaftId: plan.pipeshaft.id } });
  }

  return lines.slice(0, count);
}

function integrate(
  field: RawVelocityField,
  plan: PlanGeometry,
  seed: Vec2,
  stepM: number,
): Vec2[] {
  const out: Vec2[] = [{ x: seed.x, y: seed.y }];
  let p = { x: seed.x, y: seed.y };
  for (let step = 0; step < MAX_STEPS; step++) {
    const k1 = sampleVelocityM(field, plan, p.x, p.y);
    if (mag(k1) < MIN_SPEED) break;

    const k1n = normalize(k1);
    const k2 = sampleVelocityM(field, plan, p.x + k1n.x * stepM * 0.5, p.y + k1n.y * stepM * 0.5);
    const k2n = normalize(k2);
    const k3 = sampleVelocityM(field, plan, p.x + k2n.x * stepM * 0.5, p.y + k2n.y * stepM * 0.5);
    const k3n = normalize(k3);
    const k4 = sampleVelocityM(field, plan, p.x + k3n.x * stepM, p.y + k3n.y * stepM);
    const k4n = normalize(k4);

    const dx = (stepM / 6) * (k1n.x + 2 * k2n.x + 2 * k3n.x + k4n.x);
    const dy = (stepM / 6) * (k1n.y + 2 * k2n.y + 2 * k3n.y + k4n.y);

    const next = { x: p.x + dx, y: p.y + dy };
    if (!withinBounds(next, plan.bounds)) break;
    if (samePoint(next, p)) break;
    out.push(next);
    p = next;
  }
  return out;
}

/**
 * Sample (vx, vy) at plan-meters (px, py) via bilinear interpolation.
 * Returns velocity in plan-meter units per "step" (caller normalizes).
 */
function sampleVelocityM(field: RawVelocityField, plan: PlanGeometry, px: number, py: number): Vec2 {
  const { bounds } = plan;
  const fx = ((px - bounds.x) / bounds.width) * field.width - 0.5;
  const fy = ((py - bounds.y) / bounds.height) * field.height - 0.5;
  if (fx < 0 || fy < 0 || fx >= field.width - 1 || fy >= field.height - 1) {
    return { x: 0, y: 0 };
  }
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const v00 = at(field, x0, y0);
  const v10 = at(field, x0 + 1, y0);
  const v01 = at(field, x0, y0 + 1);
  const v11 = at(field, x0 + 1, y0 + 1);
  const u = lerp(lerp(v00.x, v10.x, tx), lerp(v01.x, v11.x, tx), ty);
  const v = lerp(lerp(v00.y, v10.y, tx), lerp(v01.y, v11.y, tx), ty);
  return { x: u, y: v };
}

function at(field: RawVelocityField, x: number, y: number): Vec2 {
  const off = (y * field.width + x) * 2;
  return { x: field.data[off], y: field.data[off + 1] };
}

function pickInflowEdge(facingDeg: number): "north" | "south" | "east" | "west" {
  const c = ((facingDeg % 360) + 360) % 360;
  if (c < 45 || c >= 315) return "north";
  if (c < 135) return "east";
  if (c < 225) return "south";
  return "west";
}

function seedPoints(bounds: Rect, edge: "north" | "south" | "east" | "west", count: number): Vec2[] {
  const out: Vec2[] = [];
  // Inset 5% from the corners so seeds don't sit on the wall.
  const insetX = bounds.width * 0.05;
  const insetY = bounds.height * 0.05;
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    if (edge === "north") {
      out.push({ x: bounds.x + insetX + t * (bounds.width - 2 * insetX), y: bounds.y + bounds.height - insetY });
    } else if (edge === "south") {
      out.push({ x: bounds.x + insetX + t * (bounds.width - 2 * insetX), y: bounds.y + insetY });
    } else if (edge === "east") {
      out.push({ x: bounds.x + bounds.width - insetX, y: bounds.y + insetY + t * (bounds.height - 2 * insetY) });
    } else {
      out.push({ x: bounds.x + insetX, y: bounds.y + insetY + t * (bounds.height - 2 * insetY) });
    }
  }
  return out;
}

function interiorSeedPoints(field: RawVelocityField, plan: PlanGeometry, count: number): Vec2[] {
  const stride = Math.max(1, Math.floor(Math.min(field.width, field.height) / 16));
  const candidates: Array<Vec2 & { speed: number; ix: number; iy: number }> = [];

  for (let y = stride; y < field.height - stride; y += stride) {
    for (let x = stride; x < field.width - stride; x += stride) {
      const v = at(field, x, y);
      const speed = mag(v);
      if (speed < MIN_SPEED) continue;
      candidates.push({
        ...gridToPlan(plan.bounds, field.width, field.height, x, y),
        speed,
        ix: x,
        iy: y,
      });
    }
  }

  return candidates
    .sort((a, b) => b.speed - a.speed || a.iy - b.iy || a.ix - b.ix)
    .slice(0, count)
    .map(({ x, y }) => ({ x, y }));
}

function gridToPlan(bounds: Rect, width: number, height: number, x: number, y: number): Vec2 {
  return {
    x: bounds.x + ((x + 0.5) / width) * bounds.width,
    y: bounds.y + ((y + 0.5) / height) * bounds.height,
  };
}

function toSvgPath(points: Vec2[]): string {
  let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${fmt(points[i].x)} ${fmt(points[i].y)}`;
  }
  return d;
}

function fmt(n: number): string {
  return Math.round(n * 1000) / 1000 + "";
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function mag(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}
function normalize(v: Vec2): Vec2 {
  const m = mag(v);
  return m > 1e-9 ? { x: v.x / m, y: v.y / m } : { x: 0, y: 0 };
}
function withinBounds(p: Vec2, b: Rect): boolean {
  return p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
}
function samePoint(a: Vec2, b: Vec2): boolean {
  return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
}
