import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import type { VelocityField } from "@/server/lbm/types";
import type { EnvironmentalMaterial } from "./materialSystem";
import {
  disposeEnvironmentalMaterials,
  renderEnvironmentalMaterials,
  updateEnvironmentalMaterials,
} from "./materialSystem";
import { AuditLicMaterial } from "./presets/auditLic";
import { PlantLeanMaterial } from "./presets/plantLean";
import { SilkRibbonMaterial } from "./presets/silkRibbon";
import { SumiInkMaterial } from "./presets/sumiInk";
import { SunlitDustMaterial } from "./presets/sunlitDust";

function makeField(): VelocityField {
  return {
    width: 4,
    height: 4,
    data: Float32Array.from([
      0.12, 0.04, 0.1, 0.06, 0.08, 0.08, 0.06, 0.1,
      0.1, 0.05, 0.08, 0.08, 0.06, 0.1, 0.04, 0.12,
      0.08, 0.06, 0.06, 0.08, 0.04, 0.1, 0.02, 0.12,
      0.06, 0.04, 0.04, 0.06, 0.02, 0.08, 0.01, 0.1,
    ]),
  };
}

describe("Environmental material presets", () => {
  it("attach named Three.js objects, update from the field, and dispose cleanly", () => {
    const scene = new THREE.Scene();
    const field = makeField();
    const planBounds = { x: 4, y: 2, width: 8, height: 6 };
    const materials: EnvironmentalMaterial[] = [
      new SumiInkMaterial(),
      new SunlitDustMaterial(),
      new SilkRibbonMaterial(),
      new PlantLeanMaterial(),
      new AuditLicMaterial(),
    ];

    renderEnvironmentalMaterials(scene, materials, { planBounds });
    for (const material of materials) material.setStrength(1.4);
    updateEnvironmentalMaterials(materials, field, 16);

    for (const material of materials) {
      assert.ok(scene.getObjectByName(`material:${material.kind}`), `${material.kind} did not attach to scene`);
    }
    assertObjectInsideBounds(scene.getObjectByName("material:sumi_ink"), planBounds);
    assertObjectInsideBounds(scene.getObjectByName("material:sunlit_dust"), planBounds);
    assertObjectInsideBounds(scene.getObjectByName("material:silk_ribbon"), planBounds);
    assertObjectInsideBounds(scene.getObjectByName("material:plant_lean"), planBounds);
    assertObjectInsideBounds(scene.getObjectByName("material:audit_lic"), planBounds);
    assertMaterialPolicy(scene);

    disposeEnvironmentalMaterials(materials);
    for (const material of materials) {
      assert.equal(scene.getObjectByName(`material:${material.kind}`), undefined);
    }
  });
});

function assertObjectInsideBounds(
  object: THREE.Object3D | undefined,
  bounds: { x: number; y: number; width: number; height: number },
) {
  assert.ok(object);
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  assert.ok(box.min.x >= bounds.x - 0.001, `min.x ${box.min.x} should be inside plan`);
  assert.ok(box.max.x <= bounds.x + bounds.width + 0.001, `max.x ${box.max.x} should be inside plan`);
  assert.ok(box.min.z >= bounds.y - 0.001, `min.z ${box.min.z} should be inside plan`);
  assert.ok(box.max.z <= bounds.y + bounds.height + 0.001, `max.z ${box.max.z} should be inside plan`);
}

function assertMaterialPolicy(scene: THREE.Scene) {
  const sumi = scene.getObjectByName("material:sumi_ink") as THREE.Line;
  const sumiMaterial = sumi.material as THREE.LineBasicMaterial;
  assert.equal(sumiMaterial.color.getHex(), 0x111111);
  assert.equal(sumiMaterial.opacity, 1);
  assert.equal(sumiMaterial.transparent, false);
  assert.equal(sumiMaterial.depthWrite, true);
  assert.equal(sumiMaterial.toneMapped, false);

  const dust = scene.getObjectByName("material:sunlit_dust") as THREE.Points;
  const dustMaterial = dust.material as THREE.PointsMaterial;
  assert.equal(dustMaterial.color.getHex(), 0xd8a24a);
  assert.equal(dustMaterial.transparent, true);
  assert.equal(dustMaterial.depthWrite, false);
  assert.equal(dustMaterial.toneMapped, false);

  const ribbon = scene.getObjectByName("material:silk_ribbon") as THREE.Line;
  const ribbonMaterial = ribbon.material as THREE.LineBasicMaterial;
  assert.equal(ribbonMaterial.color.getHex(), 0xe5c37a);
  assert.equal(ribbonMaterial.transparent, true);
  assert.equal(ribbonMaterial.depthWrite, false);
  assert.equal(ribbonMaterial.toneMapped, false);

  const auditGrid = scene.getObjectByName("material:audit_lic:grid") as THREE.LineSegments;
  const auditGridMaterial = auditGrid.material as THREE.LineBasicMaterial;
  assert.equal(auditGridMaterial.color.getHex(), 0xa79f93);
  assert.equal(auditGridMaterial.transparent, false);
  assert.equal(auditGridMaterial.depthWrite, true);
  assert.equal(auditGridMaterial.toneMapped, false);
}
