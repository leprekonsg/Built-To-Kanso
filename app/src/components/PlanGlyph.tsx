import type { ReactElement } from "react";
import type { RoomGeometry } from "@/server/geometry/types";

interface PlanGlyphProps {
  kind: RoomGeometry["kind"];
  cx: number;
  cy: number;
  label: string;
  tone: "light" | "dark";
}

// HDB-protected rooms get a quiet sumi-ink pictogram instead of a clipped
// text label. Each glyph is centered on (cx, cy) in plan-meter units and
// uses currentColor so the parent tone controls light-on-dark vs dark-in-key.
//
// Two pictograms cover every Phase 1 protected room: stacked ripples for the
// wet zones (bathrooms), concentric rectangles for the household shelter.
export function PlanGlyph({ kind, cx, cy, label, tone }: PlanGlyphProps): ReactElement {
  const color = tone === "light" ? "var(--bone-white)" : "var(--fg-2)";
  return (
    <g transform={`translate(${cx} ${cy})`} style={{ color }}>
      <title>{label}</title>
      {renderGlyph(kind)}
    </g>
  );
}

// Stroke scales with the SVG viewport so the glyph reads the same weight
// inside a 1m room rect and inside a 26px key swatch.
const STROKE = 0.03;

function renderGlyph(kind: RoomGeometry["kind"]): ReactElement {
  if (kind === "bathroom") {
    return (
      <g fill="none" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round">
        <path d="M -0.22 -0.13 q 0.055 -0.06 0.11 0 t 0.11 0 t 0.11 0 t 0.11 0" />
        <path d="M -0.22 0     q 0.055 -0.06 0.11 0 t 0.11 0 t 0.11 0 t 0.11 0" />
        <path d="M -0.22 0.13  q 0.055 -0.06 0.11 0 t 0.11 0 t 0.11 0 t 0.11 0" />
      </g>
    );
  }
  if (kind === "shelter") {
    return (
      <g fill="none" stroke="currentColor" strokeWidth={STROKE}>
        <rect x={-0.3} y={-0.21} width={0.6} height={0.42} />
        <rect x={-0.16} y={-0.09} width={0.32} height={0.18} />
      </g>
    );
  }
  // Unknown protected kind: a quiet centered dot. The key strip still names it.
  return <circle r={0.06} fill="currentColor" />;
}

export const PROTECTED_GLYPH_KINDS: ReadonlyArray<RoomGeometry["kind"]> = [
  "bathroom",
  "shelter",
];

export function glyphKindLabel(kind: RoomGeometry["kind"]): string {
  if (kind === "bathroom") return "Wet zone";
  if (kind === "shelter") return "Shelter";
  return kind;
}
