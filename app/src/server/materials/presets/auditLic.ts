/**
 * audit_lic — blueprint-style overlay for the auditor / Licensing-In-Charge view.
 *
 * Visual contract (DESIGN.md):
 *   - High-contrast linework, no amber, no decorative motion.
 *   - Used in the audit panel and PDF export.
 *
 * SCAFFOLD.
 */

import type * as THREE from "three";
import type { VelocityField } from "@/server/lbm/types";
import { type EnvironmentalMaterial, type MaterialKind, clamp01 } from "../materialSystem";

export class AuditLicMaterial implements EnvironmentalMaterial {
  readonly kind: MaterialKind = "audit_lic";
  private strength = 1;

  setStrength(value: number): void {
    this.strength = clamp01(value);
  }

  update(_field: VelocityField, _dtMs: number): void {
    // TODO: snap streamlines onto a coarse grid and stamp speed magnitudes
    // beside each segment so the auditor reads the same numbers as the
    // compliance engine.
  }

  render(_scene: THREE.Scene): void {
    // TODO: attach a flat overlay material; high-contrast lines only.
  }
}
