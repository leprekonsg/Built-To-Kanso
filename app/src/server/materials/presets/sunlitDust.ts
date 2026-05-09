/**
 * sunlit_dust — west-sun amber dust motes.
 *
 * Visual contract (DESIGN.md):
 *   - The ONLY amber on this surface; capped at <=10% area.
 *   - Particles seeded near the west-sun facade and advected by the field.
 *
 * SCAFFOLD: see TODOs.
 */

import type * as THREE from "three";
import type { VelocityField } from "@/server/lbm/types";
import { type EnvironmentalMaterial, type MaterialKind, clamp01 } from "../materialSystem";

export class SunlitDustMaterial implements EnvironmentalMaterial {
  readonly kind: MaterialKind = "sunlit_dust";
  private strength = 0.6;

  setStrength(value: number): void {
    this.strength = clamp01(value);
  }

  update(_field: VelocityField, _dtMs: number): void {
    // TODO: advect ~80 motes through bilinear-sampled velocity. Re-spawn
    // motes that exit the bounds at the west-sun facade (plan.westSunFacadeDeg).
    // Cap visible motes so total amber pixels stay <= 10% of canvas area.
  }

  render(_scene: THREE.Scene): void {
    // TODO: attach a `THREE.Points` cloud, color #D8A24A (var(--accent)), with
    // additive blending damped to keep amber from overwhelming Bone White.
  }
}
