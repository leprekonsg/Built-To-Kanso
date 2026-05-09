/**
 * audit_lic — blueprint-style overlay for the auditor / Licensing-In-Charge view.
 *
 * Visual contract (DESIGN.md):
 *   - High-contrast linework, no amber, no decorative motion.
 *   - Used in the audit panel and PDF export.
 *
 * Executable minimal preset: a neutral grid plus a velocity trace for audit
 * views. It deliberately avoids amber.
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

const AUDIT_TRACE_POINT_COUNT = 13;

export class AuditLicMaterial implements EnvironmentalMaterial {
  readonly kind: MaterialKind = "audit_lic";
  private strength = 1;
  private group: THREE.Group | null = null;
  private trace: THREE.Line | null = null;
  private traceGeometry: THREE.BufferGeometry | null = null;
  private materials: THREE.Material[] = [];
  private bounds = materialBounds();

  setStrength(value: number): void {
    this.strength = clamp01(value);
    this.materials.forEach((material) => {
      applyOverlayOpacity(material, this.strength);
    });
  }

  update(field: VelocityField, _dtMs: number): void {
    if (!this.traceGeometry) return;

    const positions = this.traceGeometry.getAttribute("position") as THREE.BufferAttribute;
    const y = Math.floor(field.height / 2);
    for (let pointIndex = 0; pointIndex < AUDIT_TRACE_POINT_COUNT; pointIndex += 1) {
      const t = pointIndex / (AUDIT_TRACE_POINT_COUNT - 1);
      const x = Math.round(t * Math.max(0, field.width - 1));
      const index = (y * field.width + x) * 2;
      const speed = Math.hypot(field.data[index] ?? 0, field.data[index + 1] ?? 0);
      positions.setXYZ(
        pointIndex,
        fieldColumnToPlanX(x, field.width, this.bounds),
        0.11,
        this.bounds.y + this.bounds.height * 0.5 + speed,
      );
    }
    positions.needsUpdate = true;
  }

  render(scene: THREE.Scene, context?: EnvironmentalMaterialContext): void {
    if (this.group) return;

    this.bounds = materialBounds(context);
    this.group = new THREE.Group();
    this.group.name = "material:audit_lic";

    const gridMaterial = new THREE.LineBasicMaterial({
      color: 0xa79f93,
      opacity: this.strength,
      toneMapped: false,
    });
    applyOverlayOpacity(gridMaterial, this.strength);
    this.materials.push(gridMaterial);
    const grid = new THREE.LineSegments(createGridGeometry(this.bounds), gridMaterial);
    grid.name = "material:audit_lic:grid";
    this.group.add(grid);

    const traceMaterial = new THREE.LineBasicMaterial({
      color: 0x111111,
      opacity: this.strength,
      toneMapped: false,
    });
    applyOverlayOpacity(traceMaterial, this.strength);
    this.materials.push(traceMaterial);
    this.traceGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(AUDIT_TRACE_POINT_COUNT * 3);
    for (let index = 0; index < AUDIT_TRACE_POINT_COUNT; index += 1) {
      const t = index / (AUDIT_TRACE_POINT_COUNT - 1);
      positions[index * 3] = this.bounds.x + this.bounds.width * t;
      positions[index * 3 + 1] = 0.11;
      positions[index * 3 + 2] = this.bounds.y + this.bounds.height / 2;
    }
    const tracePositionAttribute = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.traceGeometry.setAttribute("position", tracePositionAttribute);
    this.trace = new THREE.Line(this.traceGeometry, traceMaterial);
    this.trace.frustumCulled = false;
    this.trace.name = "material:audit_lic:velocity_trace";
    this.group.add(this.trace);
    scene.add(this.group);
  }

  dispose(): void {
    this.group?.removeFromParent();
    this.group?.traverse((object) => {
      const line = object as THREE.Line;
      line.geometry?.dispose();
    });
    this.materials.forEach((material) => material.dispose());
    this.group = null;
    this.trace = null;
    this.traceGeometry = null;
    this.materials = [];
  }
}

function createGridGeometry(bounds: { x: number; y: number; width: number; height: number }): THREE.BufferGeometry {
  const divisions = 8;
  const positions: number[] = [];
  for (let index = 0; index <= divisions; index += 1) {
    const tx = index / divisions;
    const tz = index / divisions;
    const x = bounds.x + bounds.width * tx;
    const z = bounds.y + bounds.height * tz;
    positions.push(x, 0, bounds.y, x, 0, bounds.y + bounds.height);
    positions.push(bounds.x, 0, z, bounds.x + bounds.width, 0, z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}
