import type { ExpresswayAdjacency, PlanGeometry } from "@/server/geometry/types";
import type { QuietReading } from "./quiet";

// Damped-ripple visualization for the Quiet material preset (brief Phase 1 item 17).
// Pure deterministic SVG: same (plan, reading) input produces byte-identical output.
// Geometry only — no shaders. Caller embeds the <g> group into a wider plan SVG;
// renderQuietOverlaySvg wraps it into a standalone <svg> for previews.

const RIPPLE_COUNT = 5;
const RIPPLE_COLOR = "#A79F93";
const RIPPLE_STROKE_WIDTH_M = 0.04;
const ABSORPTION_REFERENCE_M2 = 60;
const ABSORPTION_DAMPING_MIN = 0.2;
const ABSORPTION_DAMPING_MAX = 1;
const RIPPLE_OPACITY_FLOOR = 0.05;
const RIPPLE_OPACITY_CEIL = 0.7;

type Direction = "north" | "south" | "east" | "west" | "southeast";

interface RippleOrigin {
  x: number;
  y: number;
  startAngleDeg: number;
  sweepDeg: number;
}

export function renderDampedRippleSvg(plan: PlanGeometry, reading: QuietReading): string {
  const adjacency = reading.expresswayAdjacency;
  if (adjacency === "none") {
    return '<g data-layer="quiet-damped-ripple" data-state="inactive"></g>';
  }

  const origin = rippleOriginFor(plan, adjacency);
  const damping = absorptionDamping(reading.designerQuantities.absorptionAreaM2);
  const maxRadius = maxRippleRadius(plan);

  const arcs: string[] = [];
  for (let i = 1; i <= RIPPLE_COUNT; i += 1) {
    const radius = (maxRadius * i) / RIPPLE_COUNT;
    const opacity = clamp(
      (1 - radius / maxRadius) * RIPPLE_OPACITY_CEIL * damping,
      RIPPLE_OPACITY_FLOOR,
      RIPPLE_OPACITY_CEIL,
    );
    arcs.push(arcPath(origin, radius, opacity));
  }

  return (
    `<g data-layer="quiet-damped-ripple" data-adjacency="${adjacency}" ` +
    `data-damping="${round3(damping)}" fill="none" stroke="${RIPPLE_COLOR}" ` +
    `stroke-width="${RIPPLE_STROKE_WIDTH_M}" stroke-linecap="round">` +
    arcs.join("") +
    `</g>`
  );
}

export function renderQuietOverlaySvg(plan: PlanGeometry, reading: QuietReading): string {
  const { x, y, width, height } = plan.bounds;
  const viewBox = `${round2(x)} ${round2(y)} ${round2(width)} ${round2(height)}`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" data-overlay="quiet">` +
    renderDampedRippleSvg(plan, reading) +
    `</svg>`
  );
}

// PIE=north, AYE=west, BKE=south, CTE=east, KPE=southeast (approximate).
function expresswayDirection(adjacency: ExpresswayAdjacency): Direction | "none" {
  switch (adjacency) {
    case "near_pie":
      return "north";
    case "near_aye":
      return "west";
    case "near_bke":
      return "south";
    case "near_cte":
      return "east";
    case "near_kpe":
      return "southeast";
    case "none":
      return "none";
  }
}

function rippleOriginFor(plan: PlanGeometry, adjacency: ExpresswayAdjacency): RippleOrigin {
  const direction = expresswayDirection(adjacency);
  const { x, y, width, height } = plan.bounds;
  const cx = x + width / 2;
  const cy = y + height / 2;
  switch (direction) {
    case "north":
      // North wall sits at min-y in plan coords; ripples sweep down (into the plan).
      return { x: round2(cx), y: round2(y), startAngleDeg: 0, sweepDeg: 180 };
    case "south":
      return { x: round2(cx), y: round2(y + height), startAngleDeg: 180, sweepDeg: 180 };
    case "east":
      return { x: round2(x + width), y: round2(cy), startAngleDeg: 90, sweepDeg: 180 };
    case "west":
      return { x: round2(x), y: round2(cy), startAngleDeg: 270, sweepDeg: 180 };
    case "southeast":
      return { x: round2(x + width), y: round2(y + height), startAngleDeg: 180, sweepDeg: 90 };
    case "none":
      return { x: round2(cx), y: round2(cy), startAngleDeg: 0, sweepDeg: 360 };
  }
}

function absorptionDamping(absorptionAreaM2: number): number {
  return clamp(1 - absorptionAreaM2 / ABSORPTION_REFERENCE_M2, ABSORPTION_DAMPING_MIN, ABSORPTION_DAMPING_MAX);
}

function maxRippleRadius(plan: PlanGeometry): number {
  const { width, height } = plan.bounds;
  return Math.sqrt(width * width + height * height);
}

function arcPath(origin: RippleOrigin, radius: number, opacity: number): string {
  const start = polar(origin.x, origin.y, radius, origin.startAngleDeg);
  const end = polar(origin.x, origin.y, radius, origin.startAngleDeg + origin.sweepDeg);
  const largeArc = origin.sweepDeg > 180 ? 1 : 0;
  // Sweep flag 1: clockwise in SVG coordinate space (y-down).
  return (
    `<path d="M ${round2(start.x)} ${round2(start.y)} ` +
    `A ${round2(radius)} ${round2(radius)} 0 ${largeArc} 1 ` +
    `${round2(end.x)} ${round2(end.y)}" opacity="${round3(opacity)}"/>`
  );
}

function polar(cx: number, cy: number, radius: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
