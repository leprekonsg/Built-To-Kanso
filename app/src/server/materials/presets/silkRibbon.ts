/**
 * silk_ribbon — silken ribbons that drape across stagnation pockets.
 *
 * Visual contract (DESIGN.md):
 *   - Pale ink, slow undulation, used to expose calm zones (the "good"
 *     stillness in kanso reading).
 *
 * SCAFFOLD.
 */

import type * as THREE from "three";
import type { VelocityField } from "@/server/lbm/types";
import { type EnvironmentalMaterial, type MaterialKind, clamp01 } from "../materialSystem";

export class SilkRibbonMaterial implements EnvironmentalMaterial {
  readonly kind: MaterialKind = "silk_ribbon";
  private strength = 0.5;

  setStrength(value: number): void {
    this.strength = clamp01(value);
  }

  update(_field: VelocityField, _dtMs: number): void {
    // TODO: detect cells where |u| < threshold (stagnation), drape a ribbon
    // mesh whose control points relax toward those cells.
  }

  render(_scene: THREE.Scene): void {
    // TODO: attach a thin extruded ribbon (TubeGeometry) with semi-transparent
    // pale-ink material.
  }
}
