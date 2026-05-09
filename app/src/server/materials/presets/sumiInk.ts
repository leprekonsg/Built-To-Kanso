/**
 * sumi_ink — sumi-ink streamlines.
 *
 * Visual contract (DESIGN.md, brief §3):
 *   - Sumi-ink black on Bone White ground.
 *   - Hairline weight; deterministic paths from `extractStreamlines`.
 *   - The Wind Sketch export-only register: sumi-e SVG composited
 *     deterministically over GPT Image 2 backgrounds.
 *
 * This preset is a server-side Three.js adapter for the material interface so
 * Designer-mode previews and tests can mount sumi_ink alongside the other
 * materials. The canonical Wind Sketch render path remains deterministic SVG
 * (CLAUDE.md "SVG streamlines ... are the airflow source of truth in the UI").
 */

import * as THREE from "three";
import type { VelocityField } from "@/server/lbm/types";
import {
  type EnvironmentalMaterial,
  type EnvironmentalMaterialContext,
  type MaterialKind,
  applyOverlayOpacity,
  clamp01,
  fieldColumnToPlanX,
  materialBounds,
} from "../materialSystem";

const STREAM_POINT_COUNT = 17;

export class SumiInkMaterial implements EnvironmentalMaterial {
  readonly kind: MaterialKind = "sumi_ink";
  private strength = 1;
  private line: THREE.Line | null = null;
  private geometry: THREE.BufferGeometry | null = null;
  private material: THREE.LineBasicMaterial | null = null;
  private bounds = materialBounds();

  setStrength(value: number): void {
    this.strength = clamp01(value);
    if (this.material) applyOverlayOpacity(this.material, this.strength);
  }

  update(field: VelocityField, _dtMs: number): void {
    if (!this.geometry) return;

    const y = Math.floor(field.height / 2);
    const positions = this.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let pointIndex = 0; pointIndex < STREAM_POINT_COUNT; pointIndex += 1) {
      const t = pointIndex / (STREAM_POINT_COUNT - 1);
      const x = Math.round(t * Math.max(0, field.width - 1));
      const index = (y * field.width + x) * 2;
      const v = field.data[index + 1] ?? 0;
      positions.setXYZ(
        pointIndex,
        fieldColumnToPlanX(x, field.width, this.bounds),
        0.04,
        this.bounds.y + this.bounds.height / 2 + v * 0.8,
      );
    }
    positions.needsUpdate = true;
  }

  render(scene: THREE.Scene, context?: EnvironmentalMaterialContext): void {
    if (this.line) return;

    this.bounds = materialBounds(context);
    this.geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(STREAM_POINT_COUNT * 3);
    for (let index = 0; index < STREAM_POINT_COUNT; index += 1) {
      const t = index / (STREAM_POINT_COUNT - 1);
      positions[index * 3] = this.bounds.x + this.bounds.width * t;
      positions[index * 3 + 1] = 0.04;
      positions[index * 3 + 2] = this.bounds.y + this.bounds.height / 2;
    }
    const positionAttribute = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute("position", positionAttribute);

    this.material = new THREE.LineBasicMaterial({
      color: 0x111111,
      opacity: this.strength,
      toneMapped: false,
    });
    applyOverlayOpacity(this.material, this.strength);
    this.line = new THREE.Line(this.geometry, this.material);
    this.line.frustumCulled = false;
    this.line.name = "material:sumi_ink";
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
