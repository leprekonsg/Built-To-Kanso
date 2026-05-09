/**
 * plant_lean — soft plant lean indicating draft direction at a token point.
 *
 * SCAFFOLD.
 */

import type * as THREE from "three";
import type { VelocityField } from "@/server/lbm/types";
import { type EnvironmentalMaterial, type MaterialKind, clamp01 } from "../materialSystem";

export class PlantLeanMaterial implements EnvironmentalMaterial {
  readonly kind: MaterialKind = "plant_lean";
  private strength = 0.7;

  setStrength(value: number): void {
    this.strength = clamp01(value);
  }

  update(_field: VelocityField, _dtMs: number): void {
    // TODO: read velocity at each plant token's plan-meter location and tilt
    // the plant geometry's stem along the local flow direction.
  }

  render(_scene: THREE.Scene): void {
    // TODO: attach a small plant glyph (instanced mesh) with a hinged stem.
  }
}
