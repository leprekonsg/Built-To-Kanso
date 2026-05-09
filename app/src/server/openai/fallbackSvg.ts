import type { FixedElementGeometry, PlanGeometry, Rect } from "@/server/geometry/types";
import type { Tier4SimulationField, SimulationStreamline } from "@/server/simulation/types";

const SKETCH_TIER = "prototype_visualisation" as const;

const COLORS = {
  amber: "#D8A24A",
  black: "#111111",
  bone: "#F5F1E8",
  card: "#EFE9DC",
  concrete: "#A79F93",
  mute: "#8A8377",
  sage: "#7C856D",
  terracotta: "#B96F4D",
};

type FallbackKind = "plan" | "life-anchor";

export interface SketchFallbackArtifact {
  svg: string;
  contentType: "image/svg+xml";
  fallback: true;
  reason: "png_or_openai_unavailable" | "anchor_png_missing";
  nextAction: string;
  tier: typeof SKETCH_TIER;
}

function escapeSvg(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fallbackCopy(kind: FallbackKind): Pick<SketchFallbackArtifact, "reason" | "nextAction"> {
  if (kind === "life-anchor") {
    return {
      reason: "anchor_png_missing",
      nextAction: "Provide anchorPng for OpenAI materialization, or request image/svg+xml to use this deterministic anchor.",
    };
  }

  return {
    reason: "png_or_openai_unavailable",
    nextAction: "Request image/svg+xml to use the deterministic Plan Sketch fallback, or provide PNG/OpenAI prerequisites.",
  };
}

export function wantsJson(request: Request): boolean {
  const accept = request.headers.get("accept")?.toLowerCase() ?? "";
  return accept.includes("application/json") && !accept.includes("image/svg+xml");
}

export function sketchFallbackArtifact(kind: FallbackKind, svg: string): SketchFallbackArtifact {
  return {
    svg,
    contentType: "image/svg+xml",
    fallback: true,
    tier: SKETCH_TIER,
    ...fallbackCopy(kind),
  };
}

function viewBoxFor(plan: PlanGeometry) {
  const margin = 72;
  const width = 1200;
  const drawingWidth = width - margin * 2;
  const drawingHeight = drawingWidth * (plan.bounds.height / plan.bounds.width);
  const height = Math.round(drawingHeight + margin * 2 + 96);
  const scale = Math.min(drawingWidth / plan.bounds.width, drawingHeight / plan.bounds.height);

  return { width, height, margin, scale };
}

function xy(rect: Rect, scale: number, margin: number) {
  return {
    x: margin + rect.x * scale,
    y: margin + rect.y * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  };
}

function center(rect: Rect, scale: number, margin: number) {
  const box = xy(rect, scale, margin);
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

function roomFill(confidence: string): string {
  if (confidence === "black") return "#DDD6C8";
  if (confidence === "amber") return "#F0D7A3";
  return COLORS.card;
}

function fixedStroke(element: FixedElementGeometry): string {
  if (element.kind === "pipeshaft_opening") return COLORS.terracotta;
  return COLORS.black;
}

function renderOpenings(plan: PlanGeometry, scale: number, margin: number): string {
  return plan.openings
    .map((opening) => {
      const x1 = margin + opening.start.x * scale;
      const y1 = margin + opening.start.y * scale;
      const x2 = margin + opening.end.x * scale;
      const y2 = margin + opening.end.y * scale;
      const stroke = opening.kind === "door" ? COLORS.amber : COLORS.sage;
      const width = opening.kind === "door" ? 10 : 7;

      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" />`;
    })
    .join("");
}

function streamlineStroke(line: SimulationStreamline): string {
  return line.material === "sumi_ink" ? COLORS.black : COLORS.amber;
}

function streamlineWidth(line: SimulationStreamline): string {
  return line.material === "sumi_ink" ? "6.2" : "4.4";
}

function renderStreamlinePath(line: SimulationStreamline, scale: number, margin: number): string {
  const [first, ...rest] = line.points;
  if (!first) return "";
  const d = [
    `M ${(margin + first.x * scale).toFixed(1)} ${(margin + first.y * scale).toFixed(1)}`,
    ...rest.map((point) => `L ${(margin + point.x * scale).toFixed(1)} ${(margin + point.y * scale).toFixed(1)}`),
  ].join(" ");

  // Hard rule (brief Section 18): streamline geometry never passes through
  // GPT Image 2. The kasure filter is a deterministic SVG-only effect; the
  // path d-attribute is unchanged so geometry stays canonical for compliance.
  const filter = line.material === "sumi_ink" ? ` filter="url(#sumi-kasure)"` : "";
  return `<path data-streamline-id="${escapeSvg(line.id)}" data-streamline-material="${line.material}" d="${d}" fill="none" stroke="${streamlineStroke(line)}" stroke-width="${streamlineWidth(line)}" stroke-linecap="round" stroke-linejoin="round" opacity="${line.material === "sumi_ink" ? "0.68" : "0.74"}"${filter} />`;
}

// Deterministic 32-bit FNV-1a-derived integer from a string. Used to seed
// SVG <feTurbulence> so the same condition.id renders byte-identical output.
function deterministicSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // <feTurbulence seed> accepts a numeric attribute. Constrain to a friendly
  // 16-bit range so the rendered value is short and stable across viewers.
  return Math.abs(hash) % 65535;
}

interface SegmentIntersection {
  x: number;
  y: number;
  // Pair of streamline ids that produced this intersection; sorted so the
  // output is order-independent.
  ids: [string, string];
}

// Geometric segment intersection in plan-meter coordinates. Returns null when
// segments are parallel, collinear, or the intersection lies outside both
// segments. Endpoint-touching counts as a crossing only when both parameters
// are strictly inside (epsilon-guarded) to avoid bleeds at shared anchors.
function segmentIntersection(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): { x: number; y: number } | null {
  const rpx = bx - ax;
  const rpy = by - ay;
  const spx = dx - cx;
  const spy = dy - cy;
  const denom = rpx * spy - rpy * spx;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((cx - ax) * spy - (cy - ay) * spx) / denom;
  const u = ((cx - ax) * rpy - (cy - ay) * rpx) / denom;
  const eps = 1e-6;
  if (t <= eps || t >= 1 - eps) return null;
  if (u <= eps || u >= 1 - eps) return null;
  return { x: ax + t * rpx, y: ay + t * rpy };
}

export function findSumiInkCrossings(streamlines: readonly SimulationStreamline[]): SegmentIntersection[] {
  const inkLines = streamlines.filter((line) => line.material === "sumi_ink");
  const crossings: SegmentIntersection[] = [];
  for (let i = 0; i < inkLines.length; i += 1) {
    for (let j = i + 1; j < inkLines.length; j += 1) {
      const a = inkLines[i];
      const b = inkLines[j];
      for (let s = 0; s < a.points.length - 1; s += 1) {
        const p1 = a.points[s];
        const p2 = a.points[s + 1];
        for (let t = 0; t < b.points.length - 1; t += 1) {
          const q1 = b.points[t];
          const q2 = b.points[t + 1];
          const hit = segmentIntersection(p1.x, p1.y, p2.x, p2.y, q1.x, q1.y, q2.x, q2.y);
          if (!hit) continue;
          const ids: [string, string] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
          crossings.push({ x: hit.x, y: hit.y, ids });
        }
      }
    }
  }
  return crossings;
}

export function renderPlanSketchFallbackSvg(plan: PlanGeometry): string {
  const { width, height, margin, scale } = viewBoxFor(plan);
  const planWidth = plan.bounds.width * scale;
  const planHeight = plan.bounds.height * scale;
  const footerY = margin + planHeight + 52;

  const rooms = plan.rooms
    .map((room) => {
      const box = xy(room, scale, margin);
      const label = center(room, scale, margin);

      return `<g>
  <rect x="${box.x.toFixed(1)}" y="${box.y.toFixed(1)}" width="${box.width.toFixed(1)}" height="${box.height.toFixed(1)}" fill="${roomFill(room.confidence)}" stroke="${COLORS.black}" stroke-width="2.2" />
  <text x="${label.x.toFixed(1)}" y="${label.y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle">${escapeSvg(room.label)}</text>
</g>`;
    })
    .join("");

  const fixed = plan.fixedElements
    .map((element) => {
      const box = xy(element, scale, margin);
      return `<rect x="${box.x.toFixed(1)}" y="${box.y.toFixed(1)}" width="${box.width.toFixed(1)}" height="${box.height.toFixed(1)}" fill="none" stroke="${fixedStroke(element)}" stroke-width="4" stroke-dasharray="8 7" />`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" viewBox="0 0 ${width} ${height}">
<title>Plan Sketch fallback for ${escapeSvg(plan.templateId)}</title>
<desc>Deterministic top-down sketch generated from locked plan geometry. Airflow paths are omitted.</desc>
<rect width="100%" height="100%" fill="${COLORS.bone}" />
<g font-family="Inter, Arial, sans-serif" font-size="24" fill="${COLORS.black}">
  <rect x="${(margin - 18).toFixed(1)}" y="${(margin - 18).toFixed(1)}" width="${(planWidth + 36).toFixed(1)}" height="${(planHeight + 36).toFixed(1)}" fill="none" stroke="${COLORS.concrete}" stroke-width="1.4" />
  ${rooms}
  ${renderOpenings(plan, scale, margin)}
  ${fixed}
  <text x="${margin}" y="${footerY}" font-family="JetBrains Mono, ui-monospace, monospace" font-size="18" letter-spacing="2" fill="${COLORS.mute}">PLAN SKETCH FALLBACK · ${escapeSvg(plan.templateId)}</text>
</g>
</svg>`;
}

export function renderLifeAnchorFallbackSvg(plan: PlanGeometry): string {
  const { width, height, margin, scale } = viewBoxFor(plan);
  const planWidth = plan.bounds.width * scale;
  const planHeight = plan.bounds.height * scale;
  const footerY = margin + planHeight + 52;

  const rooms = plan.rooms
    .map((room) => {
      const box = xy(room, scale, margin);
      const label = center(room, scale, margin);
      const wallColor = room.confidence === "black" ? COLORS.black : COLORS.concrete;

      return `<g>
  <rect x="${(box.x + 14).toFixed(1)}" y="${(box.y - 18).toFixed(1)}" width="${box.width.toFixed(1)}" height="${box.height.toFixed(1)}" fill="${COLORS.concrete}" opacity="0.2" />
  <rect x="${box.x.toFixed(1)}" y="${box.y.toFixed(1)}" width="${box.width.toFixed(1)}" height="${box.height.toFixed(1)}" fill="${roomFill(room.confidence)}" stroke="${wallColor}" stroke-width="2.4" />
  <text x="${label.x.toFixed(1)}" y="${label.y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle">${escapeSvg(room.label)}</text>
</g>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" viewBox="0 0 ${width} ${height}">
<title>Life Sketch anchor fallback for ${escapeSvg(plan.templateId)}</title>
<desc>Deterministic structural anchor generated from locked plan geometry when the Three.js anchor PNG is unavailable.</desc>
<rect width="100%" height="100%" fill="${COLORS.bone}" />
<g font-family="Inter, Arial, sans-serif" font-size="24" fill="${COLORS.black}">
  <g transform="translate(18 -12)">
    <path d="M ${margin} ${margin + planHeight} L ${margin + 18} ${margin + planHeight - 12} L ${(margin + planWidth + 18).toFixed(1)} ${(margin + planHeight - 12).toFixed(1)} L ${(margin + planWidth).toFixed(1)} ${(margin + planHeight).toFixed(1)} Z" fill="${COLORS.concrete}" opacity="0.22" />
  </g>
  ${rooms}
  ${renderOpenings(plan, scale, margin)}
  <circle cx="${(margin + plan.pipeshaft.openingPoint.x * scale).toFixed(1)}" cy="${(margin + plan.pipeshaft.openingPoint.y * scale).toFixed(1)}" r="11" fill="${COLORS.terracotta}" />
  <text x="${margin}" y="${footerY}" font-family="JetBrains Mono, ui-monospace, monospace" font-size="18" letter-spacing="2" fill="${COLORS.mute}">LIFE SKETCH ANCHOR FALLBACK · ${escapeSvg(plan.templateId)}</text>
</g>
</svg>`;
}

export function renderWindSketchSvg(plan: PlanGeometry, field: Tier4SimulationField): string {
  const { width, height, margin, scale } = viewBoxFor(plan);
  const planWidth = plan.bounds.width * scale;
  const planHeight = plan.bounds.height * scale;
  const footerY = margin + planHeight + 52;

  const rooms = plan.rooms
    .map((room) => {
      const box = xy(room, scale, margin);
      const label = center(room, scale, margin);
      return `<g>
  <rect x="${box.x.toFixed(1)}" y="${box.y.toFixed(1)}" width="${box.width.toFixed(1)}" height="${box.height.toFixed(1)}" fill="${roomFill(room.confidence)}" stroke="${COLORS.black}" stroke-width="1.8" opacity="0.76" />
  <text x="${label.x.toFixed(1)}" y="${label.y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" opacity="0.72">${escapeSvg(room.label)}</text>
</g>`;
    })
    .join("");

  const fixed = plan.fixedElements
    .map((element) => {
      const box = xy(element, scale, margin);
      return `<rect x="${box.x.toFixed(1)}" y="${box.y.toFixed(1)}" width="${box.width.toFixed(1)}" height="${box.height.toFixed(1)}" fill="none" stroke="${fixedStroke(element)}" stroke-width="3.2" stroke-dasharray="8 7" opacity="0.82" />`;
    })
    .join("");

  const streamlines = field.streamlines
    .map((line) => renderStreamlinePath(line, scale, margin))
    .join("");

  const particles = field.particles
    .map((particle) => {
      const fill = particle.kind === "pipeshaft_drift" ? COLORS.concrete : COLORS.amber;
      return `<circle data-particle-id="${escapeSvg(particle.id)}" cx="${(margin + particle.x * scale).toFixed(1)}" cy="${(margin + particle.y * scale).toFixed(1)}" r="${particle.kind === "pipeshaft_drift" ? "8" : "5"}" fill="${fill}" opacity="0.58" />`;
    })
    .join("");

  // Sumi-e brush filters (brief Section 16.3 deterministic compositor):
  // 1. Kasure (broken-brush) on sumi_ink streamlines. Seed is derived from
  //    field.condition.id so identical input yields identical SVG bytes.
  // 2. Paper-fiber multiply overlay using #EFE9DC card token.
  // 3. Ink-bleed at sumi_ink crossings (only rendered when crossings exist).
  const kasureSeed = deterministicSeed(field.condition.id);
  const crossings = findSumiInkCrossings(field.streamlines);
  const inkBleeds = crossings
    .map((point, index) => {
      const cx = margin + point.x * scale;
      const cy = margin + point.y * scale;
      return `<circle data-ink-bleed-index="${index}" data-streamline-pair="${escapeSvg(point.ids[0])}|${escapeSvg(point.ids[1])}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="9" fill="${COLORS.black}" opacity="0.32" filter="url(#ink-bleed)" />`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" viewBox="0 0 ${width} ${height}">
<title>Wind Sketch for ${escapeSvg(plan.templateId)}</title>
<desc>Deterministic airflow composition from locked plan geometry and prebaked simulation streamlines.</desc>
<defs>
  <filter id="sumi-kasure" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${kasureSeed}" result="kasure-noise" />
    <feDisplacementMap in="SourceGraphic" in2="kasure-noise" scale="6" xChannelSelector="R" yChannelSelector="G" />
  </filter>
  <filter id="ink-bleed" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="0.04" />
    <feColorMatrix type="matrix" values="0 0 0 0 0.066 0 0 0 0 0.066 0 0 0 0 0.066 0 0 0 0.78 0" />
  </filter>
  <pattern id="washi-fiber" patternUnits="userSpaceOnUse" width="42" height="42" patternTransform="rotate(8)">
    <rect width="42" height="42" fill="${COLORS.card}" />
    <path d="M0 11 L42 9 M0 24 L42 26 M0 37 L42 35" stroke="${COLORS.concrete}" stroke-width="0.4" opacity="0.42" />
    <path d="M9 0 L11 42 M22 0 L24 42 M35 0 L37 42" stroke="${COLORS.mute}" stroke-width="0.3" opacity="0.32" />
  </pattern>
</defs>
<rect width="100%" height="100%" fill="${COLORS.bone}" />
<rect data-layer="washi-fiber-multiply" width="100%" height="100%" fill="url(#washi-fiber)" style="mix-blend-mode: multiply" opacity="0.46" />
<g font-family="Inter, Arial, sans-serif" font-size="22" fill="${COLORS.black}">
  <rect x="${(margin - 18).toFixed(1)}" y="${(margin - 18).toFixed(1)}" width="${(planWidth + 36).toFixed(1)}" height="${(planHeight + 36).toFixed(1)}" fill="none" stroke="${COLORS.concrete}" stroke-width="1.4" />
  ${rooms}
  ${renderOpenings(plan, scale, margin)}
  ${fixed}
  <g data-layer="deterministic-streamlines" data-kasure-seed="${kasureSeed}">
    ${streamlines}
    ${particles}
    ${inkBleeds ? `<g data-layer="ink-bleed-crossings">${inkBleeds}</g>` : ""}
  </g>
  <text x="${margin}" y="${footerY}" font-family="JetBrains Mono, ui-monospace, monospace" font-size="18" letter-spacing="2" fill="${COLORS.mute}">WIND SKETCH · ${escapeSvg(plan.templateId)} · ${escapeSvg(field.source.kind)}</text>
</g>
</svg>`;
}
