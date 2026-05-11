import type { FixedElementGeometry, OpeningGeometry, PlanGeometry, Rect, RoomGeometry } from "@/server/geometry/types";
import { buildLifeAnchorSceneManifest } from "@/server/anchors/lifeAnchor";
import { renderLifeAnchorSceneSvg } from "@/server/anchors/lifeAnchorRender";
import type { Tier4SimulationField, SimulationStreamline } from "@/server/simulation/types";

const SKETCH_TIER = "prototype_visualisation" as const;

const COLORS = {
  amber: "#D8A24A",
  black: "#111111",
  bone: "#F5F1E8",
  card: "#EFE9DC",
  concrete: "#A79F93",
  glass: "#DDE4D7",
  mute: "#8A8377",
  rattan: "#C9B68C",
  sage: "#7C856D",
  terracotta: "#B96F4D",
  teak: "#8A664B",
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

function renderDraftWatermark(width: number, height: number): string {
  return `<g data-render-watermark="draft" font-family="JetBrains Mono, ui-monospace, monospace" font-size="24" letter-spacing="3" fill="${COLORS.mute}" opacity="0.58">
  <text x="${(width - 64).toFixed(1)}" y="${(height - 34).toFixed(1)}" text-anchor="end">DRAFT · PROTOTYPE VISUALISATION</text>
</g>`;
}

function fixedStroke(element: FixedElementGeometry): string {
  if (element.kind === "pipeshaft_opening") return COLORS.terracotta;
  return COLORS.black;
}

function roomArea(room: RoomGeometry): number {
  return room.width * room.height;
}

function proofRooms(plan: PlanGeometry): RoomGeometry[] {
  return [...plan.rooms].sort((a, b) => roomArea(b) - roomArea(a) || a.id.localeCompare(b.id));
}

function proofRoomFill(room: RoomGeometry): string {
  if (room.confidence === "black") return "#DDD6C8";
  if (room.kind === "bedroom") return "#D7C2A2";
  if (room.kind === "kitchen") return "#E5DDD0";
  if (room.kind === "corridor") return "#F7F2E8";
  if (room.kind === "service" || room.kind === "entry") return "#EAE4D8";
  if (room.confidence === "amber") return "#ECD7A7";
  return "#F7F2E8";
}

function labelLines(room: RoomGeometry): string[] {
  if (room.kind === "shelter") return ["H/HOLD", "SHELTER"];
  if (room.kind === "bathroom") return ["BATH / WC"];
  if (room.kind === "service") return ["SERVICE", "YARD"];
  if (room.id === "main_bedroom") return ["MAIN", "BEDROOM"];
  if (room.kind === "bedroom") return [room.label.toUpperCase().replace("MASTER", "MAIN")];
  return [room.label.toUpperCase()];
}

function renderPlanRoomFills(plan: PlanGeometry, scale: number, margin: number): string {
  return proofRooms(plan)
    .map((room) => {
      const box = xy(room, scale, margin);
      const stroke = room.kind === "corridor" ? "none" : COLORS.black;
      const strokeWidth = room.kind === "corridor" ? "0" : "1.1";
      return `<rect data-room-id="${escapeSvg(room.id)}" x="${box.x.toFixed(1)}" y="${box.y.toFixed(1)}" width="${box.width.toFixed(1)}" height="${box.height.toFixed(1)}" fill="${proofRoomFill(room)}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
    })
    .join("");
}

function renderPlanRoomLabels(plan: PlanGeometry, scale: number, margin: number): string {
  return proofRooms(plan)
    .filter((room) => room.kind !== "corridor")
    .map((room) => {
      const box = xy(room, scale, margin);
      const lines = labelLines(room);
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2 - (lines.length - 1) * 7;
      const fontSize = Math.max(10, Math.min(18, Math.min(box.width / 7.6, box.height / 3.2)));
      const tspans = lines
        .map((line, index) => `<tspan x="${x.toFixed(1)}" dy="${index === 0 ? "0" : (fontSize * 1.1).toFixed(1)}">${escapeSvg(line)}</tspan>`)
        .join("");
      return `<text data-room-label="${escapeSvg(room.id)}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-family="Inter, Arial, sans-serif" font-size="${fontSize.toFixed(1)}" font-weight="700" letter-spacing="0.7" fill="${COLORS.black}" opacity="0.72">${tspans}</text>`;
    })
    .join("");
}

function renderClippedWallVolumes(plan: PlanGeometry, scale: number, margin: number): string {
  const manifest = buildLifeAnchorSceneManifest(plan);
  const wallPx = Math.max(7, Math.min(12, scale * 0.14));
  return manifest.wallVolumes
    .map((wall) => {
      const horizontal = wall.edge === "north" || wall.edge === "south";
      const length = horizontal ? wall.scale[0] : wall.scale[2];
      const x = horizontal
        ? margin + (wall.position[0] - length / 2) * scale
        : margin + wall.position[0] * scale - wallPx / 2;
      const y = horizontal
        ? margin + wall.position[2] * scale - wallPx / 2
        : margin + (wall.position[2] - length / 2) * scale;
      const width = horizontal ? length * scale : wallPx;
      const height = horizontal ? wallPx : length * scale;
      return `<rect data-wall-room="${escapeSvg(wall.roomId)}" data-wall-edge="${wall.edge}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" fill="${COLORS.black}" />`;
    })
    .join("");
}

function renderBed(box: ReturnType<typeof xy>, id: string): string {
  const bedW = box.width * 0.52;
  const bedH = box.height * 0.56;
  const x = box.x + box.width * 0.11;
  const y = box.y + box.height * 0.1;
  const pillowW = bedW * 0.34;
  return `<g data-furniture-kind="bed" data-furniture-room="${escapeSvg(id)}">
  <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bedW.toFixed(1)}" height="${bedH.toFixed(1)}" fill="${COLORS.teak}" opacity="0.72" />
  <rect x="${(x + bedW * 0.08).toFixed(1)}" y="${(y + bedH * 0.1).toFixed(1)}" width="${(bedW * 0.84).toFixed(1)}" height="${(bedH * 0.78).toFixed(1)}" fill="${COLORS.glass}" stroke="${COLORS.bone}" stroke-width="2" />
  <rect x="${(x + bedW * 0.13).toFixed(1)}" y="${(y + bedH * 0.15).toFixed(1)}" width="${pillowW.toFixed(1)}" height="${(bedH * 0.18).toFixed(1)}" fill="${COLORS.bone}" opacity="0.9" />
  <rect x="${(x + bedW * 0.53).toFixed(1)}" y="${(y + bedH * 0.15).toFixed(1)}" width="${pillowW.toFixed(1)}" height="${(bedH * 0.18).toFixed(1)}" fill="${COLORS.bone}" opacity="0.9" />
</g>`;
}

function renderLivingFurniture(box: ReturnType<typeof xy>): string {
  const sofaW = box.width * 0.2;
  const sofaH = box.height * 0.46;
  const sofaX = box.x + box.width * 0.73;
  const sofaY = box.y + box.height * 0.16;
  const tableX = box.x + box.width * 0.42;
  const tableY = box.y + box.height * 0.62;
  return `<g data-furniture-kind="living-dining">
  <rect x="${sofaX.toFixed(1)}" y="${sofaY.toFixed(1)}" width="${sofaW.toFixed(1)}" height="${sofaH.toFixed(1)}" fill="${COLORS.rattan}" stroke="${COLORS.teak}" stroke-width="2" opacity="0.86" />
  <rect x="${(sofaX - box.width * 0.18).toFixed(1)}" y="${(sofaY + sofaH * 0.36).toFixed(1)}" width="${(box.width * 0.12).toFixed(1)}" height="${(box.height * 0.11).toFixed(1)}" fill="${COLORS.card}" stroke="${COLORS.concrete}" stroke-width="1.4" />
  <rect x="${tableX.toFixed(1)}" y="${tableY.toFixed(1)}" width="${(box.width * 0.19).toFixed(1)}" height="${(box.height * 0.13).toFixed(1)}" fill="${COLORS.bone}" stroke="${COLORS.teak}" stroke-width="2" />
  <rect x="${(tableX - box.width * 0.08).toFixed(1)}" y="${(tableY + box.height * 0.03).toFixed(1)}" width="${(box.width * 0.045).toFixed(1)}" height="${(box.height * 0.07).toFixed(1)}" fill="${COLORS.rattan}" />
  <rect x="${(tableX + box.width * 0.225).toFixed(1)}" y="${(tableY + box.height * 0.03).toFixed(1)}" width="${(box.width * 0.045).toFixed(1)}" height="${(box.height * 0.07).toFixed(1)}" fill="${COLORS.rattan}" />
</g>`;
}

function renderKitchenFurniture(box: ReturnType<typeof xy>): string {
  const counter = Math.min(box.width, box.height) * 0.16;
  return `<g data-furniture-kind="kitchen">
  <rect x="${(box.x + box.width * 0.06).toFixed(1)}" y="${(box.y + box.height - counter * 1.5).toFixed(1)}" width="${(box.width * 0.72).toFixed(1)}" height="${counter.toFixed(1)}" fill="${COLORS.bone}" stroke="${COLORS.concrete}" stroke-width="1.6" />
  <rect x="${(box.x + box.width * 0.06).toFixed(1)}" y="${(box.y + box.height * 0.22).toFixed(1)}" width="${counter.toFixed(1)}" height="${(box.height * 0.55).toFixed(1)}" fill="${COLORS.bone}" stroke="${COLORS.concrete}" stroke-width="1.6" />
  <circle cx="${(box.x + box.width * 0.48).toFixed(1)}" cy="${(box.y + box.height - counter).toFixed(1)}" r="${(counter * 0.22).toFixed(1)}" fill="none" stroke="${COLORS.black}" stroke-width="1.3" opacity="0.58" />
  <circle cx="${(box.x + box.width * 0.58).toFixed(1)}" cy="${(box.y + box.height - counter).toFixed(1)}" r="${(counter * 0.22).toFixed(1)}" fill="none" stroke="${COLORS.black}" stroke-width="1.3" opacity="0.58" />
</g>`;
}

function renderBathFurniture(box: ReturnType<typeof xy>): string {
  const r = Math.max(6, Math.min(box.width, box.height) * 0.12);
  return `<g data-furniture-kind="bath">
  <circle cx="${(box.x + box.width * 0.32).toFixed(1)}" cy="${(box.y + box.height * 0.38).toFixed(1)}" r="${r.toFixed(1)}" fill="${COLORS.bone}" stroke="${COLORS.concrete}" stroke-width="1.5" />
  <rect x="${(box.x + box.width * 0.54).toFixed(1)}" y="${(box.y + box.height * 0.22).toFixed(1)}" width="${(box.width * 0.26).toFixed(1)}" height="${(box.height * 0.22).toFixed(1)}" fill="${COLORS.bone}" stroke="${COLORS.concrete}" stroke-width="1.5" />
  <rect x="${(box.x + box.width * 0.14).toFixed(1)}" y="${(box.y + box.height * 0.68).toFixed(1)}" width="${(box.width * 0.64).toFixed(1)}" height="${(box.height * 0.08).toFixed(1)}" fill="${COLORS.concrete}" opacity="0.45" />
</g>`;
}

function renderServiceFurniture(box: ReturnType<typeof xy>): string {
  const lines = Array.from({ length: 4 }, (_, index) => {
    const x = box.x + box.width * (0.22 + index * 0.14);
    return `<line x1="${x.toFixed(1)}" y1="${(box.y + box.height * 0.18).toFixed(1)}" x2="${x.toFixed(1)}" y2="${(box.y + box.height * 0.82).toFixed(1)}" stroke="${COLORS.concrete}" stroke-width="2" opacity="0.68" />`;
  }).join("");
  return `<g data-furniture-kind="service-yard">${lines}</g>`;
}

function renderPlanFurniture(plan: PlanGeometry, scale: number, margin: number): string {
  return proofRooms(plan)
    .map((room) => {
      const box = xy(room, scale, margin);
      if (room.kind === "bedroom") return renderBed(box, room.id);
      if (room.kind === "living") return renderLivingFurniture(box);
      if (room.kind === "kitchen") return renderKitchenFurniture(box);
      if (room.kind === "bathroom") return renderBathFurniture(box);
      if (room.kind === "service") return renderServiceFurniture(box);
      return "";
    })
    .join("");
}

function renderDoorSwing(opening: OpeningGeometry, plan: PlanGeometry, scale: number, margin: number): string {
  const x1 = margin + opening.start.x * scale;
  const y1 = margin + opening.start.y * scale;
  const x2 = margin + opening.end.x * scale;
  const y2 = margin + opening.end.y * scale;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.max(18, Math.hypot(dx, dy));
  const room = plan.rooms.find((candidate) => opening.roomIds.includes(candidate.id));
  const mid = { x: (opening.start.x + opening.end.x) / 2, y: (opening.start.y + opening.end.y) / 2 };
  const roomMid = room ? { x: room.x + room.width / 2, y: room.y + room.height / 2 } : { x: mid.x, y: mid.y + 1 };
  const nx = -dy / length;
  const ny = dx / length;
  const dot = nx * (roomMid.x - mid.x) + ny * (roomMid.y - mid.y);
  const sign = dot >= 0 ? 1 : -1;
  const swingX = x1 + nx * sign * length;
  const swingY = y1 + ny * sign * length;
  const sweep = sign > 0 ? 1 : 0;
  return `<g data-opening-kind="door">
  <line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${COLORS.bone}" stroke-width="15" stroke-linecap="butt" />
  <line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${swingX.toFixed(1)}" y2="${swingY.toFixed(1)}" stroke="${COLORS.black}" stroke-width="2.1" />
  <path d="M ${x2.toFixed(1)} ${y2.toFixed(1)} A ${length.toFixed(1)} ${length.toFixed(1)} 0 0 ${sweep} ${swingX.toFixed(1)} ${swingY.toFixed(1)}" fill="none" stroke="${COLORS.black}" stroke-width="1.4" opacity="0.52" />
</g>`;
}

function renderArchitecturalOpenings(plan: PlanGeometry, scale: number, margin: number): string {
  return plan.openings
    .map((opening) => {
      const x1 = margin + opening.start.x * scale;
      const y1 = margin + opening.start.y * scale;
      const x2 = margin + opening.end.x * scale;
      const y2 = margin + opening.end.y * scale;
      if (opening.kind === "door") return renderDoorSwing(opening, plan, scale, margin);
      const stroke = opening.kind === "window" ? COLORS.sage : COLORS.concrete;
      return `<g data-opening-kind="${opening.kind}">
  <line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${COLORS.bone}" stroke-width="14" stroke-linecap="butt" />
  <line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${stroke}" stroke-width="4.5" stroke-linecap="round" />
</g>`;
    })
    .join("");
}

function renderPlanFixedProof(plan: PlanGeometry, scale: number, margin: number): string {
  return plan.fixedElements
    .map((element) => {
      const box = xy(element, scale, margin);
      if (element.kind === "pipeshaft_opening") {
        return `<rect data-fixed-kind="${element.kind}" x="${box.x.toFixed(1)}" y="${box.y.toFixed(1)}" width="${box.width.toFixed(1)}" height="${box.height.toFixed(1)}" fill="${COLORS.terracotta}" stroke="${COLORS.black}" stroke-width="2" opacity="0.92" />`;
      }
      return `<rect data-fixed-kind="${element.kind}" x="${box.x.toFixed(1)}" y="${box.y.toFixed(1)}" width="${box.width.toFixed(1)}" height="${box.height.toFixed(1)}" fill="none" stroke="${fixedStroke(element)}" stroke-width="2.4" stroke-dasharray="6 6" opacity="0.68" />`;
    })
    .join("");
}

function streamlineStroke(line: SimulationStreamline): string {
  return line.material === "sumi_ink" ? COLORS.black : COLORS.sage;
}

function streamlineWidth(line: SimulationStreamline): string {
  return line.material === "sumi_ink" ? "5.4" : "4.8";
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
  const marker = line.material === "sumi_ink" ? "url(#flow-arrow-shaft)" : "url(#flow-arrow-clean)";
  return `<path data-streamline-id="${escapeSvg(line.id)}" data-streamline-material="${line.material}" d="${d}" fill="none" stroke="${streamlineStroke(line)}" stroke-width="${streamlineWidth(line)}" stroke-linecap="round" stroke-linejoin="round" opacity="${line.material === "sumi_ink" ? "0.58" : "0.72"}" marker-end="${marker}"${filter} />`;
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

export function renderTopologyProofSvg(plan: PlanGeometry): string {
  const { width, height, margin, scale } = viewBoxFor(plan);
  const planWidth = plan.bounds.width * scale;
  const planHeight = plan.bounds.height * scale;
  const footerY = margin + planHeight + 52;

  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" viewBox="0 0 ${width} ${height}">
<title>Topology proof for ${escapeSvg(plan.templateId)}</title>
<desc>Deterministic architectural topology proof generated from locked plan geometry. Furnishings are visual room cues only.</desc>
<rect width="100%" height="100%" fill="${COLORS.bone}" />
<g font-family="Inter, Arial, sans-serif" fill="${COLORS.black}">
  <text x="${margin}" y="${(margin - 30).toFixed(1)}" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="800" letter-spacing="0.4">LOCKED TOPOLOGY PROOF</text>
  <text x="${(margin + planWidth).toFixed(1)}" y="${(margin - 30).toFixed(1)}" text-anchor="end" font-family="JetBrains Mono, ui-monospace, monospace" font-size="13" letter-spacing="1.6" fill="${COLORS.mute}">${escapeSvg(plan.templateId)}</text>
  <rect x="${(margin - 18).toFixed(1)}" y="${(margin - 18).toFixed(1)}" width="${(planWidth + 36).toFixed(1)}" height="${(planHeight + 36).toFixed(1)}" fill="none" stroke="${COLORS.concrete}" stroke-width="1.4" />
  <g data-layer="room-fills">${renderPlanRoomFills(plan, scale, margin)}</g>
  <g data-layer="furniture-proof" opacity="0.92">${renderPlanFurniture(plan, scale, margin)}</g>
  <g data-layer="clipped-wall-volumes">${renderClippedWallVolumes(plan, scale, margin)}</g>
  <g data-layer="architectural-openings">${renderArchitecturalOpenings(plan, scale, margin)}</g>
  <g data-layer="fixed-service-proof">${renderPlanFixedProof(plan, scale, margin)}</g>
  <g data-layer="room-labels">${renderPlanRoomLabels(plan, scale, margin)}</g>
  <text x="${margin}" y="${footerY}" font-family="JetBrains Mono, ui-monospace, monospace" font-size="18" letter-spacing="2" fill="${COLORS.mute}">TOPOLOGY PROOF · PROTOTYPE VISUALISATION</text>
  ${renderDraftWatermark(width, height)}
</g>
</svg>`;
}

export function renderPlanSketchFallbackSvg(plan: PlanGeometry): string {
  return renderTopologyProofSvg(plan);
}

export function renderLifeAnchorFallbackSvg(plan: PlanGeometry): string {
  return renderLifeAnchorSceneSvg(buildLifeAnchorSceneManifest(plan));
}

export function renderWindSketchSvg(plan: PlanGeometry, field: Tier4SimulationField): string {
  const { width, height, margin, scale } = viewBoxFor(plan);
  const planWidth = plan.bounds.width * scale;
  const planHeight = plan.bounds.height * scale;
  const footerY = margin + planHeight + 52;

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
  <marker id="flow-arrow-clean" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto" markerUnits="strokeWidth">
    <path d="M0 0 L8 4 L0 8 Z" fill="${COLORS.sage}" opacity="0.72" />
  </marker>
  <marker id="flow-arrow-shaft" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto" markerUnits="strokeWidth">
    <path d="M0 0 L8 4 L0 8 Z" fill="${COLORS.black}" opacity="0.58" />
  </marker>
  <pattern id="washi-fiber" patternUnits="userSpaceOnUse" width="42" height="42" patternTransform="rotate(8)">
    <rect width="42" height="42" fill="${COLORS.card}" />
    <path d="M0 11 L42 9 M0 24 L42 26 M0 37 L42 35" stroke="${COLORS.concrete}" stroke-width="0.4" opacity="0.42" />
    <path d="M9 0 L11 42 M22 0 L24 42 M35 0 L37 42" stroke="${COLORS.mute}" stroke-width="0.3" opacity="0.32" />
  </pattern>
</defs>
<rect width="100%" height="100%" fill="${COLORS.bone}" />
<rect data-layer="washi-fiber-multiply" width="100%" height="100%" fill="url(#washi-fiber)" style="mix-blend-mode: multiply" opacity="0.46" />
<g font-family="Inter, Arial, sans-serif" font-size="22" fill="${COLORS.black}">
  <text x="${margin}" y="${(margin - 30).toFixed(1)}" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="800" letter-spacing="0.4">DETERMINISTIC WIND FLOW</text>
  <text x="${(margin + planWidth).toFixed(1)}" y="${(margin - 30).toFixed(1)}" text-anchor="end" font-family="JetBrains Mono, ui-monospace, monospace" font-size="13" letter-spacing="1.6" fill="${COLORS.mute}">${escapeSvg(field.condition.label)}</text>
  <rect x="${(margin - 18).toFixed(1)}" y="${(margin - 18).toFixed(1)}" width="${(planWidth + 36).toFixed(1)}" height="${(planHeight + 36).toFixed(1)}" fill="none" stroke="${COLORS.concrete}" stroke-width="1.4" />
  <g data-layer="room-fills">${renderPlanRoomFills(plan, scale, margin)}</g>
  <g data-layer="furniture-proof" opacity="0.86">${renderPlanFurniture(plan, scale, margin)}</g>
  <g data-layer="deterministic-streamlines" data-kasure-seed="${kasureSeed}">
    ${streamlines}
    ${particles}
    ${inkBleeds ? `<g data-layer="ink-bleed-crossings">${inkBleeds}</g>` : ""}
  </g>
  <g data-layer="clipped-wall-volumes">${renderClippedWallVolumes(plan, scale, margin)}</g>
  <g data-layer="architectural-openings">${renderArchitecturalOpenings(plan, scale, margin)}</g>
  <g data-layer="fixed-service-proof">${renderPlanFixedProof(plan, scale, margin)}</g>
  <g data-layer="room-labels">${renderPlanRoomLabels(plan, scale, margin)}</g>
  <text x="${margin}" y="${footerY}" font-family="JetBrains Mono, ui-monospace, monospace" font-size="18" letter-spacing="2" fill="${COLORS.mute}">WIND SKETCH · ${escapeSvg(plan.templateId)} · ${escapeSvg(field.source.kind)}</text>
  ${renderDraftWatermark(width, height)}
</g>
</svg>`;
}

// Stage C composition over a GPT Image 2 Stage B background. Reuses the same
// deterministic streamline geometry as renderWindSketchSvg but drops the
// procedural washi pattern, room fills, furniture, and labels — Stage B
// provides those as a single styled raster. Walls and openings stay on top
// so the architectural reading remains crisp under the brushwork.
export function renderWindSketchOverBaseSvg(
  plan: PlanGeometry,
  field: Tier4SimulationField,
  basePng: Buffer,
): string {
  const { width, height, margin, scale } = viewBoxFor(plan);
  const planWidth = plan.bounds.width * scale;
  const planHeight = plan.bounds.height * scale;
  const footerY = margin + planHeight + 52;

  const streamlines = field.streamlines
    .map((line) => renderStreamlinePath(line, scale, margin))
    .join("");
  const particles = field.particles
    .map((particle) => {
      const fill = particle.kind === "pipeshaft_drift" ? COLORS.concrete : COLORS.amber;
      return `<circle data-particle-id="${escapeSvg(particle.id)}" cx="${(margin + particle.x * scale).toFixed(1)}" cy="${(margin + particle.y * scale).toFixed(1)}" r="${particle.kind === "pipeshaft_drift" ? "8" : "5"}" fill="${fill}" opacity="0.58" />`;
    })
    .join("");
  const kasureSeed = deterministicSeed(field.condition.id);
  const crossings = findSumiInkCrossings(field.streamlines);
  const inkBleeds = crossings
    .map((point, index) => {
      const cx = margin + point.x * scale;
      const cy = margin + point.y * scale;
      return `<circle data-ink-bleed-index="${index}" data-streamline-pair="${escapeSvg(point.ids[0])}|${escapeSvg(point.ids[1])}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="9" fill="${COLORS.black}" opacity="0.32" filter="url(#ink-bleed)" />`;
    })
    .join("");

  const baseDataUri = `data:image/png;base64,${basePng.toString("base64")}`;
  // The Stage B PNG covers the entire plan bounds — anchor it to the same
  // (margin, margin, planWidth, planHeight) box the SVG layers reference so
  // streamlines align with the styled background pixel-for-pixel.
  const baseImage = `<image data-layer="stage-b-background" href="${baseDataUri}" x="${margin}" y="${margin}" width="${planWidth.toFixed(1)}" height="${planHeight.toFixed(1)}" preserveAspectRatio="none" />`;

  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" viewBox="0 0 ${width} ${height}">
<title>Wind Sketch (Stage B + C) for ${escapeSvg(plan.templateId)}</title>
<desc>Deterministic LBM streamlines composed over a GPT Image 2 Stage B sumi-e background. Stage A solves airflow, Stage B renders the styled top-down, Stage C composes streamlines on top.</desc>
<defs>
  <filter id="sumi-kasure" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${kasureSeed}" result="kasure-noise" />
    <feDisplacementMap in="SourceGraphic" in2="kasure-noise" scale="6" xChannelSelector="R" yChannelSelector="G" />
  </filter>
  <filter id="ink-bleed" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="0.04" />
    <feColorMatrix type="matrix" values="0 0 0 0 0.066 0 0 0 0 0.066 0 0 0 0 0.066 0 0 0 0.78 0" />
  </filter>
  <marker id="flow-arrow-clean" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto" markerUnits="strokeWidth">
    <path d="M0 0 L8 4 L0 8 Z" fill="${COLORS.sage}" opacity="0.72" />
  </marker>
  <marker id="flow-arrow-shaft" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto" markerUnits="strokeWidth">
    <path d="M0 0 L8 4 L0 8 Z" fill="${COLORS.black}" opacity="0.58" />
  </marker>
</defs>
<rect width="100%" height="100%" fill="${COLORS.bone}" />
${baseImage}
<g font-family="Inter, Arial, sans-serif" font-size="22" fill="${COLORS.black}">
  <text x="${margin}" y="${(margin - 30).toFixed(1)}" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="800" letter-spacing="0.4">DETERMINISTIC WIND FLOW</text>
  <text x="${(margin + planWidth).toFixed(1)}" y="${(margin - 30).toFixed(1)}" text-anchor="end" font-family="JetBrains Mono, ui-monospace, monospace" font-size="13" letter-spacing="1.6" fill="${COLORS.mute}">${escapeSvg(field.condition.label)}</text>
  <rect x="${(margin - 18).toFixed(1)}" y="${(margin - 18).toFixed(1)}" width="${(planWidth + 36).toFixed(1)}" height="${(planHeight + 36).toFixed(1)}" fill="none" stroke="${COLORS.concrete}" stroke-width="1.4" />
  <g data-layer="deterministic-streamlines" data-kasure-seed="${kasureSeed}">
    ${streamlines}
    ${particles}
    ${inkBleeds ? `<g data-layer="ink-bleed-crossings">${inkBleeds}</g>` : ""}
  </g>
  <g data-layer="fixed-service-proof">${renderPlanFixedProof(plan, scale, margin)}</g>
  <text x="${margin}" y="${footerY}" font-family="JetBrains Mono, ui-monospace, monospace" font-size="18" letter-spacing="2" fill="${COLORS.mute}">WIND SKETCH · STAGE B + C · ${escapeSvg(plan.templateId)} · ${escapeSvg(field.source.kind)}</text>
  ${renderDraftWatermark(width, height)}
</g>
</svg>`;
}
