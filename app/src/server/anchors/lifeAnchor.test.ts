import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { describe, it } from "node:test";
import * as THREE from "three";
import { getPlanGeometry, listGeometrySummaries } from "@/server/geometry/registry";
import {
  buildLifeAnchorSceneManifest,
  clearLifeAnchorByteCache,
  createLifeAnchorThreeScene,
  getLifeAnchorCachePath,
  lifeAnchorSketchCacheKey,
  renderLifeAnchorPng,
  resolveLifeAnchorArtifact,
} from "./lifeAnchor";
import { renderLifeSketchSumiSvg } from "./lifeAnchorRender";

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("Life Sketch anchor pipeline", () => {
  it("uses a per-template cached PNG anchor when present", async () => {
    const root = await mkdtemp(join(tmpdir(), "kanso-life-anchor-"));
    try {
      const plan = getPlanGeometry("resale-exec-1990s");
      const cache = getLifeAnchorCachePath(plan.templateId, root);
      await mkdir(cache.directory, { recursive: true });
      await writeFile(cache.absolutePath, PNG_BYTES);

      const artifact = await resolveLifeAnchorArtifact(plan, { cacheRoot: root });

      assert.equal(artifact.source, "cache-png");
      assert.equal(artifact.contentType, "image/png");
      assert.equal(artifact.cachePath, `life-anchors/resale-exec-1990s/anchor.png`);
      assert.deepEqual(artifact.png, PNG_BYTES);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns deterministic SVG and scene metadata when no cached PNG exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "kanso-life-anchor-"));
    try {
      const plan = getPlanGeometry("tampines-greenweave");
      const artifact = await resolveLifeAnchorArtifact(plan, { cacheRoot: root });

      assert.equal(artifact.source, "deterministic-svg");
      assert.equal(artifact.contentType, "image/svg+xml");
      assert.equal(artifact.cachePath, `life-anchors/tampines-greenweave/anchor.png`);
      assert.equal(artifact.manifest.camera.kind, "perspective");
      assert.equal(artifact.manifest.metadata.complianceTruth, false);
      assert.equal(artifact.manifest.metadata.geometrySource, "architect_curated_template");
      assert.equal(artifact.manifest.metadata.source, "three-perspective-greybox-scene-manifest");
      assert.match(artifact.svg, /camera-view greybox anchor/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("builds a Node-safe perspective Three.js manifest without mutating plan geometry", () => {
    const plan = getPlanGeometry("tengah-5room");
    const before = JSON.stringify(plan);

    const manifest = buildLifeAnchorSceneManifest(plan);

    assert.equal(JSON.stringify(plan), before);
    assert.equal(manifest.templateId, "tengah-5room");
    assert.equal(manifest.camera.kind, "perspective");
    assert.equal(manifest.camera.aspect, 1536 / 1024);
    assert.deepEqual(manifest.camera.up, [0, 1, 0]);
    assert.equal(manifest.rooms.length, plan.rooms.length);
    assert.equal(manifest.wallVolumes.length, plan.rooms.length * 4);
    assert.equal(manifest.fixedElements.length, plan.fixedElements.length);
    assert.equal(manifest.metadata.hdbCeilingHeightM, 2.6);
    assert.equal(manifest.metadata.topologyProof, "plan-sketches/tengah-5room/plan.png");
    assert.ok(manifest.cachePath.endsWith(`${sep}life-anchors${sep}tengah-5room${sep}anchor.png`));
  });

  it("renders a deterministic sumi-e Life Sketch from the same locked anchor manifest", () => {
    const plan = getPlanGeometry("resale-exec-1990s");
    const manifest = buildLifeAnchorSceneManifest(plan);
    const first = renderLifeSketchSumiSvg(manifest);
    const second = renderLifeSketchSumiSvg(manifest);

    assert.equal(first, second);
    assert.match(first, /data-life-sketch-source="deterministic-sumi-e"/);
    assert.match(first, /data-layer="locked-anchor-materialized-surfaces"/);
    assert.match(first, /fixed:household_shelter_black/);
    assert.match(first, /opening:/);
    assert.doesNotMatch(first, /Master Bedroom/);
    assert.doesNotMatch(first, /DRAFT · PROTOTYPE VISUALISATION/);
  });

  it("fits the perspective camera to the fixed 1536x1024 anchor viewport", () => {
    const plan = getPlanGeometry("resale-exec-1990s");
    const manifest = buildLifeAnchorSceneManifest(plan);

    assert.equal(Number(manifest.camera.aspect.toFixed(6)), Number((1536 / 1024).toFixed(6)));
    assert.equal(manifest.camera.fov, 46);
    assert.equal(manifest.viewport.width, 1536);
    assert.equal(manifest.viewport.height, 1024);
  });

  it("builds a stable eye-level camera basis for plan-coordinate projection", () => {
    const plan = getPlanGeometry("tampines-greenweave");
    const { camera } = createLifeAnchorThreeScene(plan);
    camera.updateMatrixWorld(true);

    const projected = new THREE.Vector3(plan.bounds.x, 0, plan.bounds.y).project(camera);

    assert.equal(camera.up.x, 0);
    assert.equal(camera.up.y, 1);
    assert.equal(camera.up.z, 0);
    assert.ok(camera.position.y > 7 && camera.position.y < 8);
    assert.ok(Number.isFinite(projected.x));
    assert.ok(Number.isFinite(projected.y));
    assert.ok(Number.isFinite(projected.z));
  });

  it("renders every door, window, and louver into the Three.js anchor scene", () => {
    const plan = getPlanGeometry("resale-exec-1990s");
    const { scene } = createLifeAnchorThreeScene(plan);

    for (const opening of plan.openings) {
      assert.ok(scene.getObjectByName(`opening:${opening.id}`), `missing opening mesh for ${opening.id}`);
    }
  });

  it("uses physical materials for anchor surfaces without changing geometry counts", () => {
    const plan = getPlanGeometry("resale-exec-1990s");
    const { scene } = createLifeAnchorThreeScene(plan);
    const floor = scene.getObjectByName(`room:${plan.rooms[0].id}`) as THREE.Mesh;
    const wall = scene.getObjectByName(`wall:${plan.rooms[0].id}:north`) as THREE.Mesh;
    const windowOpening = plan.openings.find((opening) => opening.kind === "window");
    assert.ok(windowOpening);
    const windowMesh = scene.getObjectByName(`opening:${windowOpening.id}`) as THREE.Mesh;
    const floorMaterial = floor.material;
    const wallMaterial = wall.material;
    const windowMaterial = windowMesh.material;

    assert.ok(floorMaterial instanceof THREE.MeshPhysicalMaterial);
    assert.ok(wallMaterial instanceof THREE.MeshPhysicalMaterial);
    assert.ok(windowMaterial instanceof THREE.MeshPhysicalMaterial);
    assert.equal(floorMaterial.clearcoat, 0.34);
    assert.equal(wallMaterial.clearcoat, 0);
    assert.equal(windowMaterial.transmission, 0.85);
  });

  it("preserves structural counts and HDB signature anchors for every Phase 1 template", () => {
    for (const summary of listGeometrySummaries()) {
      const plan = getPlanGeometry(summary.templateId);
      const manifest = buildLifeAnchorSceneManifest(plan);
      const { scene } = createLifeAnchorThreeScene(plan);

      assert.equal(manifest.rooms.length, plan.rooms.length, `${plan.templateId} room count changed`);
      assert.equal(manifest.wallVolumes.length, plan.rooms.length * 4, `${plan.templateId} wall volume count changed`);
      assert.equal(manifest.openings.length, plan.openings.length, `${plan.templateId} opening count changed`);
      assert.equal(manifest.fixedElements.length, plan.fixedElements.length, `${plan.templateId} fixed-element count changed`);
      assert.deepEqual(
        manifest.rooms.map((room) => room.id).sort(),
        plan.rooms.map((room) => room.id).sort(),
      );
      assert.deepEqual(
        manifest.openings.map((opening) => opening.id).sort(),
        plan.openings.map((opening) => opening.id).sort(),
      );
      assert.deepEqual(
        manifest.fixedElements.map((element) => element.id).sort(),
        plan.fixedElements.map((element) => element.id).sort(),
      );
      assert.ok(scene.getObjectByName(`pipeshaft:${plan.pipeshaft.id}`), `${plan.templateId} missing pipeshaft anchor`);
      assert.ok(scene.getObjectByName(`wall:${plan.rooms[0].id}:north`), `${plan.templateId} missing extruded wall volume`);
      assert.ok(
        plan.fixedElements.some((element) => element.kind === "pipeshaft_opening" && element.bufferEligible),
        `${plan.templateId} missing buffer-eligible pipeshaft opening`,
      );
    }
  });

  it("disposes generated Three.js geometry and materials after PNG rendering", async () => {
    const plan = getPlanGeometry("tampines-greenweave");
    let geometryDisposeCount = 0;
    let materialDisposeCount = 0;

    const result = await renderLifeAnchorPng(plan, {
      async renderPng({ scene }) {
        scene.traverse((object) => {
          const mesh = object as THREE.Mesh;
          mesh.geometry?.addEventListener("dispose", () => {
            geometryDisposeCount += 1;
          });
          const material = mesh.material;
          if (Array.isArray(material)) {
            material.forEach((item) => item.addEventListener("dispose", () => {
              materialDisposeCount += 1;
            }));
          } else {
            material?.addEventListener("dispose", () => {
              materialDisposeCount += 1;
            });
          }
        });
        return PNG_BYTES;
      },
    });

    assert.equal(result.ok, true);
    const expectedMeshes = plan.rooms.length + plan.rooms.length * 4 + plan.fixedElements.length + plan.openings.length + 1;
    assert.ok(geometryDisposeCount >= expectedMeshes);
    assert.ok(materialDisposeCount >= expectedMeshes);
  });

  it("derives a stable per-template legacy anchor cache key", () => {
    assert.equal(lifeAnchorSketchCacheKey("tampines-greenweave"), "life-anchor:tampines-greenweave");
    assert.equal(lifeAnchorSketchCacheKey("tengah-5room"), "life-anchor:tengah-5room");
    assert.equal(lifeAnchorSketchCacheKey("resale-exec-1990s"), "life-anchor:resale-exec-1990s");
  });

  it("falls back to deterministic SVG when no local PNG exists (R2 retired)", async () => {
    const root = await mkdtemp(join(tmpdir(), "kanso-life-anchor-"));
    try {
      clearLifeAnchorByteCache();
      const plan = getPlanGeometry("tampines-greenweave");
      const artifact = await resolveLifeAnchorArtifact(plan, { cacheRoot: root });
      assert.equal(artifact.source, "deterministic-svg");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("local cache PNG short-circuits anchor resolution", async () => {
    const root = await mkdtemp(join(tmpdir(), "kanso-life-anchor-"));
    try {
      clearLifeAnchorByteCache();
      const plan = getPlanGeometry("resale-exec-1990s");
      const cache = getLifeAnchorCachePath(plan.templateId, root);
      await mkdir(cache.directory, { recursive: true });
      await writeFile(cache.absolutePath, PNG_BYTES);

      const artifact = await resolveLifeAnchorArtifact(plan, { cacheRoot: root });
      assert.equal(artifact.source, "cache-png");
      assert.deepEqual(artifact.png, PNG_BYTES);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
