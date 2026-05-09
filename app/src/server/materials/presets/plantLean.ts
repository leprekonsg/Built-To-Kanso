/**
 * plant_lean — soft plant lean indicating draft direction at a token point.
 *
 * Executable minimal preset: three light plant glyphs lean with the field's
 * average velocity. Scene-element production rendering lives in LiveStudio.
 */

import * as THREE from "three";
import type { VelocityField } from "@/server/lbm/types";
import {
  type EnvironmentalMaterial,
  type EnvironmentalMaterialContext,
  type MaterialKind,
  clamp01,
  materialBounds,
} from "../materialSystem";

export class PlantLeanMaterial implements EnvironmentalMaterial {
  readonly kind: MaterialKind = "plant_lean";
  private strength = 0.7;
  private group: THREE.Group | null = null;
  private materials: THREE.Material[] = [];
  private bounds = materialBounds();

  setStrength(value: number): void {
    this.strength = clamp01(value);
  }

  update(field: VelocityField, _dtMs: number): void {
    if (!this.group) return;

    const [vx, vy] = averageVelocity(field);
    const lean = THREE.MathUtils.clamp(Math.hypot(vx, vy) * this.strength, 0, 0.38);
    const direction = Math.atan2(vy, vx || 1e-6);
    this.group.children.forEach((child, index) => {
      child.rotation.z = Math.cos(direction + index * 0.35) * lean;
      child.rotation.x = Math.sin(direction + index * 0.35) * lean;
    });
  }

  render(scene: THREE.Scene, context?: EnvironmentalMaterialContext): void {
    if (this.group) return;

    this.bounds = materialBounds(context);
    const stemMaterial = new THREE.MeshBasicMaterial({ color: 0x5e6b4c, toneMapped: false });
    const leafMaterial = new THREE.MeshBasicMaterial({ color: 0x7c856d, toneMapped: false });
    this.materials = [stemMaterial, leafMaterial];
    this.group = new THREE.Group();
    this.group.name = "material:plant_lean";

    for (let index = 0; index < 3; index += 1) {
      const plant = new THREE.Group();
      plant.position.set(
        this.bounds.x + this.bounds.width * (0.2 + index * 0.28),
        0.1,
        this.bounds.y + this.bounds.height * (0.72 - index * 0.12),
      );

      const stem = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.42, 0.025), stemMaterial);
      stem.position.y = 0.21;
      plant.add(stem);

      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), leafMaterial);
      leaf.scale.set(1.45, 0.35, 0.8);
      leaf.position.y = 0.45;
      plant.add(leaf);

      this.group.add(plant);
    }

    scene.add(this.group);
  }

  dispose(): void {
    this.group?.removeFromParent();
    this.group?.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
    });
    this.materials.forEach((material) => material.dispose());
    this.group = null;
    this.materials = [];
  }
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
