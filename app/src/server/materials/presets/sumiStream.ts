/**
 * sumi_stream — sumi-ink streamlines.
 *
 * Visual contract (DESIGN.md):
 *   - Sumi-ink black on Bone White ground.
 *   - Hairline weight; deterministic paths from `extractStreamlines`.
 *   - This is the canonical airflow visual (CLAUDE.md "SVG streamlines ...
 *     are the airflow source of truth in the UI").
 *
 * SCAFFOLD: this preset is a placeholder. The real implementation pulls SVG
 * paths from `streamlines.ts` and either renders them as `THREE.Line` strips
 * or as an HTML SVG overlay above the canvas (see LiveStudio).
 */

import type * as THREE from "three";
import type { VelocityField } from "@/server/lbm/types";
import { type EnvironmentalMaterial, type MaterialKind, clamp01 } from "../materialSystem";

export class SumiStreamMaterial implements EnvironmentalMaterial {
  readonly kind: MaterialKind = "sumi_stream";
  private strength = 1;

  setStrength(value: number): void {
    this.strength = clamp01(value);
  }

  update(_field: VelocityField, _dtMs: number): void {
    // TODO: re-extract streamlines or interpolate ribbon offsets toward the
    // freshly stepped field. For static reduced-motion mode we render once.
  }

  render(_scene: THREE.Scene): void {
    // TODO: attach line geometry built from extractStreamlines() output.
    // Material is `LineBasicMaterial({ color: 0x111111, transparent: true })`
    // with opacity = this.strength. Width is hairline; thickness comes from
    // the SVG overlay path stroke, not the three.js line.
  }
}
