/**
 * silk_ribbon — silken ribbons that drape across stagnation pockets.
 *
 * Visual contract (DESIGN.md):
 *   - Pale ink, slow undulation, used to expose calm zones (the "good"
 *     stillness in kanso reading).
 *
 * Executable minimal preset. The ribbon lifts subtly as the field slows.
 */

import * as THREE from "three";
import type { VelocityField } from "@/server/lbm/types";
import {
  type EnvironmentalMaterial,
  type EnvironmentalMaterialContext,
  type MaterialKind,
  applyOverlayOpacity,
  clamp01,
  materialBounds,
} from "../materialSystem";

const RIBBON_POINT_COUNT = 18;

export class SilkRibbonMaterial implements EnvironmentalMaterial {
  readonly kind: MaterialKind = "silk_ribbon";
  private strength = 0.5;
  private line: THREE.Line | null = null;
  private geometry: THREE.BufferGeometry | null = null;
  private material: THREE.LineBasicMaterial | null = null;
  private bounds = materialBounds();

  setStrength(value: number): void {
    this.strength = clamp01(value);
    if (this.material) applyOverlayOpacity(this.material, silkOpacity(this.strength));
  }

  update(field: VelocityField, _dtMs: number): void {
    if (!this.geometry) return;

    const calm = 1 - THREE.MathUtils.clamp(averageSpeed(field) / 0.25, 0, 1);
    const amplitude = calm * this.strength * this.bounds.height * 0.04;
    const positions = this.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let index = 0; index < RIBBON_POINT_COUNT; index += 1) {
      const t = index / (RIBBON_POINT_COUNT - 1);
      positions.setXYZ(
        index,
        this.bounds.x + this.bounds.width * t,
        0.06,
        this.bounds.y + this.bounds.height * 0.62 + Math.sin(t * Math.PI * 2) * amplitude,
      );
    }
    positions.needsUpdate = true;
  }

  render(scene: THREE.Scene, context?: EnvironmentalMaterialContext): void {
    if (this.line) return;

    this.bounds = materialBounds(context);
    this.geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(RIBBON_POINT_COUNT * 3);
    for (let index = 0; index < RIBBON_POINT_COUNT; index += 1) {
      const t = index / (RIBBON_POINT_COUNT - 1);
      positions[index * 3] = this.bounds.x + this.bounds.width * t;
      positions[index * 3 + 1] = 0.06;
      positions[index * 3 + 2] = this.bounds.y + this.bounds.height * 0.62;
    }
    const positionAttribute = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute("position", positionAttribute);

    this.material = new THREE.LineBasicMaterial({
      color: 0xe5c37a,
      opacity: silkOpacity(this.strength),
      toneMapped: false,
    });
    applyOverlayOpacity(this.material, silkOpacity(this.strength));
    this.line = new THREE.Line(this.geometry, this.material);
    this.line.frustumCulled = false;
    this.line.name = "material:silk_ribbon";
    scene.add(this.line);
  }

  dispose(): void {
    this.line?.removeFromParent();
    this.geometry?.dispose();
    this.material?.dispose();
    this.line = null;
    this.geometry = null;
    this.material = null;
  }
}

function silkOpacity(strength: number): number {
  return 0.18 + strength * 0.34;
}

function averageSpeed(field: VelocityField): number {
  if (field.data.length < 2) return 0;
  let speed = 0;
  let count = 0;
  for (let index = 0; index < field.data.length; index += 2) {
    speed += Math.hypot(field.data[index] ?? 0, field.data[index + 1] ?? 0);
    count += 1;
  }
  return speed / count;
}
