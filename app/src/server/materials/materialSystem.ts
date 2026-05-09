/**
 * Material System interface — the visualisation adapter for the velocity field.
 *
 * Per brief §3, five "Environmental Materials" are exposed:
 *   sumi_ink     — sumi-ink streamlines (Wind Sketch export-only register)
 *   sunlit_dust  — west-sun amber dust motes (the only amber on the surface)
 *   silk_ribbon  — silken ribbons that drape across stagnation pockets
 *   plant_lean   — soft plant lean indicating draft direction
 *   audit_lic    — blueprint-style overlay for the auditor / LIC view
 *
 * Each material consumes the shared `VelocityField` and renders into a
 * three.js scene. Materials are passive consumers: they do NOT mutate the
 * field. `setStrength` is a 0..1 dial driven by the Studio UI.
 */

import type * as THREE from "three";
import type { VelocityField } from "@/server/lbm/types";

export interface MaterialPlanBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EnvironmentalMaterialContext {
  planBounds?: MaterialPlanBounds;
}

export type MaterialKind =
  | "sumi_ink"
  | "sunlit_dust"
  | "silk_ribbon"
  | "plant_lean"
  | "audit_lic";

/**
 * Designer-mode preset selector. Each preset routes the field through a
 * different material register; the homeowner-facing default is the composed
 * monsoon_atelier_default. The four single-material presets correspond 1:1
 * with the homeowner-visible kinds (sumi_ink, sunlit_dust, silk_ribbon) plus
 * the designer-only audit_lic. plant_lean rides the same Wind Visibility dial
 * as the primary three (brief Section 5.4) and is not a top-level preset.
 */
export type MaterialPreset =
  | "monsoon_atelier_default"
  | "sumi_ink"
  | "sunlit_dust"
  | "silk_ribbon"
  | "audit_lic";

/**
 * Controlled state for the Designer-mode material parameter panel. The first
 * eight entries are the brief's normative parameter set (Section 5.2 line 124).
 * The trailing five are preset-resolution dials lifted from the magic numbers
 * inside the preset implementations so an ID firm can tune the same shape the
 * preset author tuned.
 *
 * All percent fields are integers in [0, 100]. Resolution fields are integers
 * inside the documented range. Non-finite inputs must be rejected by the
 * caller (see `clampPercent` and `clampInt` in DesignerMaterialControls).
 */
export interface MaterialParameterState {
  // Brief-normative eight.
  preset: MaterialPreset;
  visibility: number; // 0-100, overall opacity
  density: number; // 0-100, streamline + particle count slice
  turbulence: number; // 0-100, jitter amount
  softness: number; // 0-100, edge softness (gaussian / kasure)
  velocityWidthMod: number; // 0-100, speedMps -> stroke-width modulation
  stagnationOpacityThreshold: number; // 0-100, velocity-magnitude % below which the wash kicks in
  textureScale: number; // 0-100, sumi-paper / fiber pattern scale

  // Preset-resolution dials (formerly magic numbers inside the preset modules).
  streamlineSegments: number; // 8-48, sumi_ink point count
  particleCount: number; // 16-256, sunlit_dust mote count
  ribbonAmplitude: number; // 0-100, silk_ribbon undulation strength
  plantLeanLimit: number; // 0-100, plant_lean clamp ceiling
  auditGridDivisions: number; // 4-32, audit_lic grid divisions
}

export const MATERIAL_PARAMETER_RANGES = {
  streamlineSegments: { min: 8, max: 48, step: 1 },
  particleCount: { min: 16, max: 256, step: 1 },
  auditGridDivisions: { min: 4, max: 32, step: 1 },
} as const;

export const DEFAULT_MATERIAL_PARAMETERS: MaterialParameterState = {
  preset: "monsoon_atelier_default",
  visibility: 58,
  density: 64,
  turbulence: 28,
  softness: 50,
  velocityWidthMod: 40,
  stagnationOpacityThreshold: 18,
  textureScale: 42,
  streamlineSegments: 17,
  particleCount: 80,
  ribbonAmplitude: 50,
  plantLeanLimit: 38,
  auditGridDivisions: 8,
};

export interface EnvironmentalMaterial {
  readonly kind: MaterialKind;
  /** Visual strength dial, 0..1. */
  setStrength(value: number): void;
  /** Called once per frame with the latest velocity field. */
  update(field: VelocityField, dtMs: number): void;
  /** Called once at mount; the material attaches its objects to the scene. */
  render(scene: THREE.Scene, context?: EnvironmentalMaterialContext): void;
  /** Releases geometries/materials owned by this material. */
  dispose?(): void;
}

export function renderEnvironmentalMaterials(
  scene: THREE.Scene,
  materials: readonly EnvironmentalMaterial[],
  context?: EnvironmentalMaterialContext,
): void {
  for (const material of materials) {
    material.render(scene, context);
  }
}

export function updateEnvironmentalMaterials(
  materials: readonly EnvironmentalMaterial[],
  field: VelocityField,
  dtMs: number,
): void {
  for (const material of materials) {
    material.update(field, dtMs);
  }
}

export function disposeEnvironmentalMaterials(materials: readonly EnvironmentalMaterial[]): void {
  for (const material of materials) {
    material.dispose?.();
  }
}

/**
 * Helper for presets that need a clamped strength dial.
 * Hoisted at module scope per Vercel rule "server-hoist-static-io".
 */
export function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Coerce an unknown value into an integer percent in [0, 100]. Non-finite
 * inputs (NaN, Infinity, undefined) collapse to 0 rather than propagate.
 */
export function clampPercent(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * Coerce an unknown value into an integer in [min, max]. Non-finite inputs
 * collapse to `min` so a corrupt slider event never propagates as NaN.
 */
export function clampInt(value: unknown, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function applyOverlayOpacity(material: THREE.Material, value: number): void {
  const opacity = clamp01(value);
  const transparent = opacity < 0.999;
  material.opacity = opacity;
  material.depthWrite = !transparent;
  if (material.transparent !== transparent) {
    material.transparent = transparent;
    material.needsUpdate = true;
  }
}

export function materialBounds(context?: EnvironmentalMaterialContext): MaterialPlanBounds {
  return context?.planBounds ?? { x: -1, y: -1, width: 2, height: 2 };
}

export function fieldColumnToPlanX(column: number, width: number, bounds: MaterialPlanBounds): number {
  const t = width <= 1 ? 0.5 : column / (width - 1);
  return bounds.x + bounds.width * t;
}

export function fieldRowToPlanZ(row: number, height: number, bounds: MaterialPlanBounds): number {
  const t = height <= 1 ? 0.5 : row / (height - 1);
  return bounds.y + bounds.height * t;
}
