/**
 * Material System interface — the visualisation adapter for the velocity field.
 *
 * Per brief §3, five "Environmental Materials" are exposed:
 *   sumi_stream  — sumi-ink streamlines (the canonical air-flow line)
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

export type MaterialKind =
  | "sumi_stream"
  | "sunlit_dust"
  | "silk_ribbon"
  | "plant_lean"
  | "audit_lic";

export interface EnvironmentalMaterial {
  readonly kind: MaterialKind;
  /** Visual strength dial, 0..1. */
  setStrength(value: number): void;
  /** Called once per frame with the latest velocity field. */
  update(field: VelocityField, dtMs: number): void;
  /** Called once at mount; the material attaches its objects to the scene. */
  render(scene: THREE.Scene): void;
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
