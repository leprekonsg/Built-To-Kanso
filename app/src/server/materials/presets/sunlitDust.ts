/**
 * sunlit_dust — west-sun amber dust motes.
 *
 * Visual contract (DESIGN.md):
 *   - The ONLY amber on this surface; capped at <=10% area.
 *   - Particles seeded near the west-sun facade and advected by the field.
 *
 * Lightweight executable preset for the server-side material interface.
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

const MOTE_COUNT = 80;

export class SunlitDustMaterial implements EnvironmentalMaterial {
  readonly kind: MaterialKind = "sunlit_dust";
  private strength = 0.6;
  private points: THREE.Points | null = null;
  private geometry: THREE.BufferGeometry | null = null;
  private material: THREE.PointsMaterial | null = null;
  private bounds = materialBounds();

  setStrength(value: number): void {
    this.strength = clamp01(value);
    if (this.material) applyOverlayOpacity(this.material, dustOpacity(this.strength));
  }

  update(field: VelocityField, dtMs: number): void {
    if (!this.geometry) return;

    const positions = this.geometry.getAttribute("position") as THREE.BufferAttribute;
    const [vx, vz] = averageVelocity(field);
    const dt = Math.min(64, Math.max(0, dtMs)) / 1000;
    for (let index = 0; index < positions.count; index += 1) {
      const x = wrapPlan(positions.getX(index) + vx * dt * this.strength, this.bounds.x, this.bounds.width);
      const z = wrapPlan(positions.getZ(index) + vz * dt * this.strength, this.bounds.y, this.bounds.height);
      positions.setXYZ(index, x, 0.09, z);
    }
    positions.needsUpdate = true;
  }

  render(scene: THREE.Scene, context?: EnvironmentalMaterialContext): void {
    if (this.points) return;

    this.bounds = materialBounds(context);
    const positions = new Float32Array(MOTE_COUNT * 3);
    for (let index = 0; index < MOTE_COUNT; index += 1) {
      positions[index * 3] = this.bounds.x + (((index * 37) % MOTE_COUNT) / MOTE_COUNT) * this.bounds.width;
      positions[index * 3 + 1] = 0.09;
      positions[index * 3 + 2] = this.bounds.y + (((index * 53) % MOTE_COUNT) / MOTE_COUNT) * this.bounds.height;
    }

    this.geometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute("position", positionAttribute);
    this.material = new THREE.PointsMaterial({
      color: 0xd8a24a,
      size: 0.035,
      sizeAttenuation: false,
      opacity: dustOpacity(this.strength),
      toneMapped: false,
    });
    applyOverlayOpacity(this.material, dustOpacity(this.strength));
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.name = "material:sunlit_dust";
    scene.add(this.points);
  }

  dispose(): void {
    this.points?.removeFromParent();
    this.geometry?.dispose();
    this.material?.dispose();
    this.points = null;
    this.geometry = null;
    this.material = null;
  }
}

function dustOpacity(strength: number): number {
  return strength * 0.42;
}

function averageVelocity(field: VelocityField): [number, number] {
  if (field.data.length < 2) return [0, 0];
  let vx = 0;
  let vy = 0;
  let count = 0;
  for (let index = 0; index < field.data.length; index += 2) {
    vx += field.data[index] ?? 0;
    vy += field.data[index + 1] ?? 0;
    count += 1;
  }
  return [vx / count, vy / count];
}

function wrapPlan(value: number, start: number, size: number): number {
  if (size <= 0) return start;
  if (value > start + size) return start;
  if (value < start) return start + size;
  return value;
}
