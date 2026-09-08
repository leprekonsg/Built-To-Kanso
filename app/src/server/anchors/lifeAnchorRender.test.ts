import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import * as THREE from "three";
import { getPlanGeometry, listGeometrySummaries } from "@/server/geometry/registry";
import {
  buildLifeAnchorCacheMetadata,
  buildLifeAnchorSceneManifest,
  createLifeAnchorThreeScene,
  getLifeAnchorCachePath,
  lifeAnchorManifestHash,
  renderLifeAnchorPng,
  resolveLifeAnchorArtifact,
} from "./lifeAnchor";
import { renderLifeAnchorSceneSvg } from "./lifeAnchorRender";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==", "base64");

describe("anchor geometry and artifact regressions", () => {
  it("keeps every generated mesh vertex inside the orthographic viewport and clipping planes", async () => {
    for (const { templateId } of listGeometrySummaries()) {
      await renderLifeAnchorPng(getPlanGeometry(templateId), {
        async renderPng({ scene, camera }) {
          scene.updateMatrixWorld(true);
          scene.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            const positions = object.geometry.getAttribute("position");
            for (let i = 0; i < positions.count; i += 1) {
              const point = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld).project(camera);
              assert.ok(Math.abs(point.x) <= 0.92 + 1e-6 && Math.abs(point.y) <= 0.92 + 1e-6,
                `${templateId} ${object.name} extends outside the viewport margin`);
              assert.ok(point.z >= -1 && point.z <= 1, `${templateId} ${object.name} is clipped`);
            }
          });
          return png;
        },
      });
    }
  });

  it("cuts wall material out of every opening while retaining sills and lintels", () => {
    for (const { templateId } of listGeometrySummaries()) {
      const manifest = buildLifeAnchorSceneManifest(getPlanGeometry(templateId));
      for (const opening of manifest.openings) {
        if (!opening.renderable) continue;
        const horizontal = Math.abs(opening.start[2] - opening.end[2]) < 1e-6;
        const along = horizontal ? 0 : 2;
        const perp = horizontal ? 2 : 0;
        const lo = Math.min(opening.start[along], opening.end[along]);
        const hi = Math.max(opening.start[along], opening.end[along]);
        let lintel = false;
        for (const wall of manifest.wallVolumes) {
          if (Math.abs(wall.position[perp] - opening.position[perp]) > 1e-6) continue;
          const overlap = Math.min(hi, wall.position[along] + wall.scale[along] / 2) - Math.max(lo, wall.position[along] - wall.scale[along] / 2);
          if (overlap <= 1e-6) continue;
          const bottom = wall.position[1] - wall.scale[1] / 2;
          const top = wall.position[1] + wall.scale[1] / 2;
          const openingTop = opening.position[1] + opening.scale[1] / 2;
          const openingBottom = opening.position[1] - opening.scale[1] / 2;
          assert.ok(Math.min(top, openingTop) - Math.max(bottom, openingBottom) <= 1e-6,
            `${templateId} ${opening.id} contains solid wall material`);
          if (Math.abs(bottom - openingTop) < 1e-6) lintel = true;
        }
        assert.ok(lintel, `${templateId} ${opening.id} lost its lintel`);
      }
    }
  });

  it("keeps washer stacks clear of protected fixed elements", () => {
    for (const { templateId } of listGeometrySummaries()) {
      const plan = getPlanGeometry(templateId);
      const manifest = buildLifeAnchorSceneManifest(plan);
      for (const fixture of manifest.serviceYardAffordances.filter((item) => item.kind === "washer_stack")) {
        for (const element of plan.fixedElements.filter((item) => item.kind !== "wet_zone")) {
          const overlapX = Math.min(fixture.position[0] + fixture.scale[0] / 2, element.x + element.width) - Math.max(fixture.position[0] - fixture.scale[0] / 2, element.x);
          const overlapZ = Math.min(fixture.position[2] + fixture.scale[2] / 2, element.y + element.height) - Math.max(fixture.position[2] - fixture.scale[2] / 2, element.y);
          assert.ok(overlapX <= 1e-6 || overlapZ <= 1e-6, `${templateId} washer covers ${element.id}`);
        }
      }
    }
  });

  it("flags the conflicting Tampines entry and preserves an undivided protected shelter", () => {
    const plan = getPlanGeometry("tampines-greenweave");
    const manifest = buildLifeAnchorSceneManifest(plan);
    assert.equal(manifest.metadata.geometryIssues.length, 1);
    assert.match(manifest.metadata.geometryIssues[0], /entry.*household_shelter_black/);
    assert.equal(manifest.rooms.find((room) => room.id === "entry")?.renderable, false);
    assert.equal(manifest.openings.find((opening) => opening.id === "main_door")?.renderable, false);
    assert.equal(manifest.wallVolumes.some((wall) => wall.roomId === "entry"), false);
    const svg = renderLifeAnchorSceneSvg(manifest);
    assert.doesNotMatch(svg, /data-anchor-face="(?:room:entry|wall:entry|opening:main_door):/);
    assert.match(svg, /fixed:household_shelter_black/);
    assert.deepEqual(buildLifeAnchorSceneManifest(getPlanGeometry("tengah-5room")).metadata.geometryIssues, []);
    assert.deepEqual(buildLifeAnchorSceneManifest(getPlanGeometry("resale-exec-1990s")).metadata.geometryIssues, []);
  });

  it("projects diagonal openings exactly like the Three.js mesh and shades the top face", () => {
    const plan = structuredClone(getPlanGeometry("tengah-5room"));
    plan.openings[0].end = { x: plan.openings[0].start.x + 0.5, y: plan.openings[0].start.y + 0.5 };
    const { scene, camera, manifest } = createLifeAnchorThreeScene(plan);
    const opening = manifest.openings[0];
    const mesh = scene.getObjectByName(`opening:${opening.id}`) as THREE.Mesh;
    mesh.updateMatrixWorld(true);
    const expected = [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([x, z]) => {
      const point = new THREE.Vector3(x * opening.scale[0] / 2, opening.scale[1] / 2, z * opening.scale[2] / 2)
        .applyMatrix4(mesh.matrixWorld).project(camera);
      return `${Math.round((point.x + 1) * manifest.viewport.width / 2 * 100) / 100},${Math.round((1 - point.y) * manifest.viewport.height / 2 * 100) / 100}`;
    }).sort();
    const svg = renderLifeAnchorSceneSvg(manifest);
    const top = svg.match(new RegExp(`data-anchor-face="opening:${opening.id}:1" points="([^"]+)" fill="([^"]+)"`));
    assert.ok(top);
    assert.deepEqual(top[1].split(" ").sort(), expected);
    assert.equal(top[2], "#E5B666");
  });

  it("rejects geometry behind the camera instead of drawing it over the scene", () => {
    const manifest = buildLifeAnchorSceneManifest(getPlanGeometry("tengah-5room"));
    manifest.rooms = [];
    manifest.wallVolumes = [];
    manifest.fixedElements = [];
    manifest.serviceYardAffordances = [];
    manifest.camera.position = [0, 0, 0];
    manifest.camera.lookAt = [0, 0, -1];
    manifest.openings = [{ ...manifest.openings[0], position: [0, 0, 3], scale: [1, 1, 1] }];
    assert.doesNotMatch(renderLifeAnchorSceneSvg(manifest), /data-anchor-face=/);
  });

  it("sorts surfaces by camera depth rather than distance from the image center", () => {
    const manifest = buildLifeAnchorSceneManifest(getPlanGeometry("tengah-5room"));
    manifest.rooms = [];
    manifest.wallVolumes = [];
    manifest.fixedElements = [];
    manifest.serviceYardAffordances = [];
    manifest.camera.position = [0, 0, 0];
    manifest.camera.lookAt = [0, 0, -1];
    manifest.openings = [
      { ...manifest.openings[0], id: "near-side", position: [4, 0, -4], scale: [0.1, 0.1, 0.1] },
      { ...manifest.openings[0], id: "far-center", position: [0, 0, -5], scale: [0.1, 0.1, 0.1] },
    ];
    const svg = renderLifeAnchorSceneSvg(manifest);
    assert.ok(svg.lastIndexOf("opening:far-center:") < svg.indexOf("opening:near-side:"));
  });

  it("does not reuse stale anchor bytes across roots, disk edits, or geometry revisions", async () => {
    const root = await mkdtemp(join(tmpdir(), "kanso-anchor-provenance-"));
    try {
      const plan = getPlanGeometry("tengah-5room");
      const cache = getLifeAnchorCachePath(plan.templateId, root);
      const manifest = buildLifeAnchorSceneManifest(plan, root);
      await mkdir(cache.directory, { recursive: true });
      await writeFile(cache.absolutePath, png);
      assert.equal((await resolveLifeAnchorArtifact(plan, { cacheRoot: root })).source, "deterministic-svg");
      await writeFile(cache.metadataAbsolutePath, JSON.stringify(buildLifeAnchorCacheMetadata(manifest, png)));
      assert.equal((await resolveLifeAnchorArtifact(plan, { cacheRoot: root })).source, "cache-png");
      assert.equal((await resolveLifeAnchorArtifact(plan, { cacheRoot: join(root, "other") })).source, "deterministic-svg");
      assert.equal(lifeAnchorManifestHash(manifest), lifeAnchorManifestHash(buildLifeAnchorSceneManifest(plan, join(root, "other"))));
      const revised = structuredClone(plan);
      revised.rooms[0].width += 0.1;
      assert.equal((await resolveLifeAnchorArtifact(revised, { cacheRoot: root })).source, "deterministic-svg");
      await writeFile(cache.absolutePath, Buffer.concat([png, Buffer.from([0])]));
      assert.equal((await resolveLifeAnchorArtifact(plan, { cacheRoot: root })).source, "deterministic-svg");
      const corruptPng = png.subarray(0, 8);
      await writeFile(cache.absolutePath, corruptPng);
      await writeFile(cache.metadataAbsolutePath, JSON.stringify(buildLifeAnchorCacheMetadata(manifest, corruptPng)));
      assert.equal((await resolveLifeAnchorArtifact(plan, { cacheRoot: root })).source, "deterministic-svg");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
