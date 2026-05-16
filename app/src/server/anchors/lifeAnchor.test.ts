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

type SpanInterval = { start: number; end: number };

function unionIntervals(intervals: SpanInterval[]): SpanInterval[] {
  const sorted = [...intervals]
    .filter((iv) => iv.end - iv.start > 1e-6)
    .sort((a, b) => a.start - b.start);
  const out: SpanInterval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.start <= last.end + 1e-4) {
      last.end = Math.max(last.end, iv.end);
    } else {
      out.push({ ...iv });
    }
  }
  return out;
}

function totalIntervalLength(intervals: SpanInterval[]): number {
  return intervals.reduce((s, iv) => s + Math.max(0, iv.end - iv.start), 0);
}

function assertNoDuplicateCoplanarWalls(
  templateId: string,
  wallVolumes: ReturnType<typeof buildLifeAnchorSceneManifest>["wallVolumes"],
): void {
  const eps = 1e-3;
  for (let i = 0; i < wallVolumes.length; i++) {
    for (let j = i + 1; j < wallVolumes.length; j++) {
      const a = wallVolumes[i];
      const b = wallVolumes[j];
      const aHorizontal = a.edge === "north" || a.edge === "south";
      const bHorizontal = b.edge === "north" || b.edge === "south";
      if (aHorizontal !== bHorizontal) continue;
      const aPerp = aHorizontal ? a.position[2] : a.position[0];
      const bPerp = bHorizontal ? b.position[2] : b.position[0];
      if (Math.abs(aPerp - bPerp) > eps) continue;
      const aLen = aHorizontal ? a.scale[0] : a.scale[2];
      const bLen = bHorizontal ? b.scale[0] : b.scale[2];
      const aCenter = aHorizontal ? a.position[0] : a.position[2];
      const bCenter = bHorizontal ? b.position[0] : b.position[2];
      const overlap =
        Math.min(aCenter + aLen / 2, bCenter + bLen / 2) -
        Math.max(aCenter - aLen / 2, bCenter - bLen / 2);
      assert.ok(
        overlap <= eps,
        `${templateId} duplicate coplanar walls: ${a.roomId}:${a.edge} and ${b.roomId}:${b.edge} overlap by ${overlap.toFixed(3)}m at perp ${aPerp.toFixed(3)}`,
      );
    }
  }
}

function assertEnvelopeClosed(
  plan: ReturnType<typeof getPlanGeometry>,
  wallVolumes: ReturnType<typeof buildLifeAnchorSceneManifest>["wallVolumes"],
): void {
  const eps = 0.02;
  const bounds = plan.bounds;
  const edges = [
    { name: "north", horizontal: true, perp: bounds.y },
    { name: "south", horizontal: true, perp: bounds.y + bounds.height },
    { name: "west", horizontal: false, perp: bounds.x },
    { name: "east", horizontal: false, perp: bounds.x + bounds.width },
  ] as const;

  for (const edge of edges) {
    const footprintRaw: SpanInterval[] = [];
    for (const room of plan.rooms) {
      const otherLo = edge.horizontal ? room.y : room.x;
      const otherHi = otherLo + (edge.horizontal ? room.height : room.width);
      if (Math.abs(otherLo - edge.perp) > eps && Math.abs(otherHi - edge.perp) > eps) continue;
      const spanStart = edge.horizontal ? room.x : room.y;
      const spanEnd = spanStart + (edge.horizontal ? room.width : room.height);
      footprintRaw.push({ start: spanStart, end: spanEnd });
    }
    const footprint = unionIntervals(footprintRaw);
    if (footprint.length === 0) continue;

    const wallRaw: SpanInterval[] = [];
    for (const wall of wallVolumes) {
      const wallHorizontal = wall.edge === "north" || wall.edge === "south";
      if (wallHorizontal !== edge.horizontal) continue;
      const wallPerp = wallHorizontal ? wall.position[2] : wall.position[0];
      if (Math.abs(wallPerp - edge.perp) > eps) continue;
      const len = wallHorizontal ? wall.scale[0] : wall.scale[2];
      const center = wallHorizontal ? wall.position[0] : wall.position[2];
      wallRaw.push({ start: center - len / 2, end: center + len / 2 });
    }
    const walls = unionIntervals(wallRaw);

    for (const fp of footprint) {
      const overlap = unionIntervals(
        walls.map((w) => ({
          start: Math.max(w.start, fp.start),
          end: Math.min(w.end, fp.end),
        })),
      );
      const coveredLen = totalIntervalLength(overlap);
      const fpLen = fp.end - fp.start;
      assert.ok(
        coveredLen >= fpLen - eps,
        `${plan.templateId} envelope ${edge.name} gap at [${fp.start.toFixed(3)}, ${fp.end.toFixed(3)}]: walls cover ${coveredLen.toFixed(3)}m of ${fpLen.toFixed(3)}m`,
      );
    }
  }
}

function assertOpeningsOnSurvivingWalls(
  templateId: string,
  manifestOpenings: ReturnType<typeof buildLifeAnchorSceneManifest>["openings"],
  wallVolumes: ReturnType<typeof buildLifeAnchorSceneManifest>["wallVolumes"],
): void {
  const eps = 0.02;
  for (const opening of manifestOpenings) {
    const dx = opening.end[0] - opening.start[0];
    const dz = opening.end[2] - opening.start[2];
    const horizontal = Math.abs(dx) >= Math.abs(dz);
    const perp = horizontal
      ? (opening.start[2] + opening.end[2]) / 2
      : (opening.start[0] + opening.end[0]) / 2;
    const oLo = horizontal
      ? Math.min(opening.start[0], opening.end[0])
      : Math.min(opening.start[2], opening.end[2]);
    const oHi = horizontal
      ? Math.max(opening.start[0], opening.end[0])
      : Math.max(opening.start[2], opening.end[2]);

    const matchingWalls: SpanInterval[] = [];
    for (const wall of wallVolumes) {
      const wallHorizontal = wall.edge === "north" || wall.edge === "south";
      if (wallHorizontal !== horizontal) continue;
      const wallPerp = wallHorizontal ? wall.position[2] : wall.position[0];
      if (Math.abs(wallPerp - perp) > eps) continue;
      const len = wallHorizontal ? wall.scale[0] : wall.scale[2];
      const center = wallHorizontal ? wall.position[0] : wall.position[2];
      matchingWalls.push({ start: center - len / 2, end: center + len / 2 });
    }
    const wallUnion = unionIntervals(matchingWalls);
    const overlap = unionIntervals(
      wallUnion.map((w) => ({
        start: Math.max(w.start, oLo),
        end: Math.min(w.end, oHi),
      })),
    );
    const covered = totalIntervalLength(overlap);
    const need = oHi - oLo;
    assert.ok(
      covered >= need - eps,
      `${templateId} opening ${opening.id} hovers in a void: walls cover ${covered.toFixed(3)}m of ${need.toFixed(3)}m at perp ${perp.toFixed(3)}`,
    );
  }
}

function assertNoWallCrossesWinningRoomInterior(
  plan: ReturnType<typeof getPlanGeometry>,
  wallVolumes: ReturnType<typeof buildLifeAnchorSceneManifest>["wallVolumes"],
): void {
  const eps = 1e-6;
  for (const wall of wallVolumes) {
    const owner = plan.rooms.find((room) => room.id === wall.roomId);
    assert.ok(owner, `wall references unknown room ${wall.roomId}`);
    const ownerArea = owner.width * owner.height;
    const horizontal = wall.edge === "north" || wall.edge === "south";
    const perp = horizontal ? wall.position[2] : wall.position[0];
    const length = horizontal ? wall.scale[0] : wall.scale[2];
    const start = (horizontal ? wall.position[0] : wall.position[2]) - length / 2;
    const end = (horizontal ? wall.position[0] : wall.position[2]) + length / 2;

    for (const other of plan.rooms) {
      if (other.id === wall.roomId) continue;
      if (other.kind === "corridor") continue;
      const otherArea = other.width * other.height;
      const otherWins = otherArea < ownerArea || (otherArea === ownerArea && other.id < owner.id);
      if (!otherWins) continue;

      const perpLo = horizontal ? other.y : other.x;
      const perpHi = perpLo + (horizontal ? other.height : other.width);
      if (perp <= perpLo + eps || perp >= perpHi - eps) continue;

      const spanLo = horizontal ? other.x : other.y;
      const spanHi = spanLo + (horizontal ? other.width : other.height);
      const overlap = Math.min(end, spanHi) - Math.max(start, spanLo);
      assert.ok(
        overlap <= eps,
        `${plan.templateId} ${wall.roomId}:${wall.edge} crosses winning room ${other.id}`,
      );
    }
  }
}

function expectedWallOwnerIds(plan: ReturnType<typeof getPlanGeometry>): Set<string> {
  return new Set(plan.rooms.filter((room) => room.kind !== "corridor").map((room) => room.id));
}

function assertCorridorsDoNotEmitWalls(
  plan: ReturnType<typeof getPlanGeometry>,
  wallVolumes: ReturnType<typeof buildLifeAnchorSceneManifest>["wallVolumes"],
): void {
  const corridorIds = new Set(plan.rooms.filter((room) => room.kind === "corridor").map((room) => room.id));
  for (const wall of wallVolumes) {
    assert.equal(corridorIds.has(wall.roomId), false, `${plan.templateId} corridor emitted wall ${wall.roomId}:${wall.edge}`);
  }
}

function assertCorridorLivingConnectionOpen(
  plan: ReturnType<typeof getPlanGeometry>,
  wallVolumes: ReturnType<typeof buildLifeAnchorSceneManifest>["wallVolumes"],
): void {
  const eps = 0.16;
  const corridors = plan.rooms.filter((room) => room.kind === "corridor");
  const livingRooms = plan.rooms.filter((room) => room.kind === "living");

  for (const corridor of corridors) {
    for (const living of livingRooms) {
      const corridorEast = corridor.x + corridor.width;
      const livingWest = living.x;
      if (Math.abs(corridorEast - livingWest) > eps) continue;

      const spanStart = Math.max(corridor.y, living.y);
      const spanEnd = Math.min(corridor.y + corridor.height, living.y + living.height);
      if (spanEnd <= spanStart) continue;

      for (const wall of wallVolumes) {
        const vertical = wall.edge === "east" || wall.edge === "west";
        if (!vertical) continue;
        if (Math.abs(wall.position[0] - livingWest) > eps) continue;
        const length = wall.scale[2];
        const wallStart = wall.position[2] - length / 2;
        const wallEnd = wall.position[2] + length / 2;
        const overlap = Math.min(wallEnd, spanEnd) - Math.max(wallStart, spanStart);
        assert.ok(overlap <= eps, `${plan.templateId} corridor-to-living connection is boxed by ${wall.roomId}:${wall.edge}`);
      }
    }
  }
}

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
    // Wall segments are clipped against overlapping room rects so the count is
    // no longer rooms * 4. Corridors are circulation voids; adjacent rooms own
    // the real partition walls.
    assert.ok(manifest.wallVolumes.length > 0, "wall volumes empty");
    const wallRoomIds = new Set(manifest.wallVolumes.map((w) => w.roomId));
    assert.deepEqual(wallRoomIds, expectedWallOwnerIds(plan), "every non-corridor room must contribute walls");
    assertCorridorsDoNotEmitWalls(plan, manifest.wallVolumes);
    assertCorridorLivingConnectionOpen(plan, manifest.wallVolumes);
    assertNoWallCrossesWinningRoomInterior(plan, manifest.wallVolumes);
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

  it("includes service-yard affordances in the sumi-e Life Sketch SVG for templates with a service yard", () => {
    const plan = getPlanGeometry("tampines-greenweave");
    const manifest = buildLifeAnchorSceneManifest(plan);
    const svg = renderLifeSketchSumiSvg(manifest);
    const serviceRoom = plan.rooms.find((room) => room.kind === "service");
    assert.ok(serviceRoom, "tampines-greenweave should expose a service yard for this test to be meaningful");
    assert.match(svg, new RegExp(`service_fixture:${serviceRoom.id}:washer_stack`));
    assert.match(svg, new RegExp(`service_fixture:${serviceRoom.id}:floor_drain`));
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

  it("renders a washer stack and floor drain for every service yard", () => {
    for (const summary of listGeometrySummaries()) {
      const plan = getPlanGeometry(summary.templateId);
      const serviceRooms = plan.rooms.filter((room) => room.kind === "service");
      if (serviceRooms.length === 0) continue;

      const manifest = buildLifeAnchorSceneManifest(plan);
      const { scene } = createLifeAnchorThreeScene(plan);

      for (const room of serviceRooms) {
        const washer = manifest.serviceYardAffordances.find(
          (item) => item.roomId === room.id && item.kind === "washer_stack",
        );
        const drain = manifest.serviceYardAffordances.find(
          (item) => item.roomId === room.id && item.kind === "floor_drain",
        );
        assert.ok(washer, `${plan.templateId} ${room.id} missing washer_stack affordance`);
        assert.ok(drain, `${plan.templateId} ${room.id} missing floor_drain affordance`);

        // Affordances must sit inside the service yard rectangle, not floating
        // through walls into adjacent rooms (kitchen, Household Shelter).
        for (const fixture of [washer, drain]) {
          if (!fixture) continue;
          const halfX = fixture.scale[0] / 2;
          const halfZ = fixture.scale[2] / 2;
          assert.ok(
            fixture.position[0] - halfX >= room.x - 1e-3,
            `${plan.templateId} ${fixture.kind} extends west of yard`,
          );
          assert.ok(
            fixture.position[0] + halfX <= room.x + room.width + 1e-3,
            `${plan.templateId} ${fixture.kind} extends east of yard`,
          );
          assert.ok(
            fixture.position[2] - halfZ >= room.y - 1e-3,
            `${plan.templateId} ${fixture.kind} extends north of yard`,
          );
          assert.ok(
            fixture.position[2] + halfZ <= room.y + room.height + 1e-3,
            `${plan.templateId} ${fixture.kind} extends south of yard`,
          );
        }

        assert.ok(
          scene.getObjectByName(`service_fixture:${room.id}:washer_stack`),
          `${plan.templateId} missing washer_stack mesh for ${room.id}`,
        );
        assert.ok(
          scene.getObjectByName(`service_fixture:${room.id}:floor_drain`),
          `${plan.templateId} missing floor_drain mesh for ${room.id}`,
        );
      }
    }
  });

  it("keeps service-yard affordances out of compliance fixedElements", () => {
    for (const summary of listGeometrySummaries()) {
      const plan = getPlanGeometry(summary.templateId);
      const manifest = buildLifeAnchorSceneManifest(plan);

      assert.equal(
        manifest.fixedElements.length,
        plan.fixedElements.length,
        `${plan.templateId} service affordances leaked into fixedElements`,
      );
      for (const element of manifest.fixedElements) {
        assert.ok(
          element.kind !== ("washer_stack" as unknown) && element.kind !== ("floor_drain" as unknown),
          `${plan.templateId} compliance fixedElement promoted a visual affordance`,
        );
      }
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
      // Walls are clipped against overlapping rooms; corridors stay as floor
      // circulation rather than emitting their own walls.
      assert.ok(manifest.wallVolumes.length > 0, `${plan.templateId} walls empty after clipping`);
      const wallRoomIds = new Set(manifest.wallVolumes.map((w) => w.roomId));
      assert.deepEqual(wallRoomIds, expectedWallOwnerIds(plan), `${plan.templateId} a non-corridor room lost all its walls after clipping`);
      assertCorridorsDoNotEmitWalls(plan, manifest.wallVolumes);
      assertCorridorLivingConnectionOpen(plan, manifest.wallVolumes);
      assertNoWallCrossesWinningRoomInterior(plan, manifest.wallVolumes);
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

  it("keeps Phase 1 bathroom count and bedroom circulation doors explicit", () => {
    for (const summary of listGeometrySummaries()) {
      const plan = getPlanGeometry(summary.templateId);
      const roomById = new Map(plan.rooms.map((room) => [room.id, room]));
      const bathroomRooms = plan.rooms.filter((room) => room.kind === "bathroom");
      const shelterRooms = plan.rooms.filter((room) => room.kind === "shelter");

      assert.equal(bathroomRooms.length, 2, `${plan.templateId} should expose exactly two bathroom rooms`);
      assert.equal(plan.bathrooms.length, bathroomRooms.length, `${plan.templateId} bathroom metadata must match bathroom rooms`);
      assert.equal(shelterRooms.length, 1, `${plan.templateId} should expose exactly one Household Shelter room`);

      for (const bedroom of plan.rooms.filter((room) => room.kind === "bedroom")) {
        const hasCirculationDoor = plan.openings.some((opening) => {
          if (opening.kind !== "door" || !opening.roomIds.includes(bedroom.id)) return false;
          return opening.roomIds.some((id) => {
            const room = roomById.get(id);
            return room?.kind === "corridor" || room?.kind === "living" || room?.kind === "entry";
          });
        });
        assert.ok(hasCirculationDoor, `${plan.templateId} ${bedroom.id} needs a bedroom-to-circulation door`);
      }
    }
  });

  it("emits each party wall only once under the smaller-wins rule", () => {
    for (const summary of listGeometrySummaries()) {
      const plan = getPlanGeometry(summary.templateId);
      const manifest = buildLifeAnchorSceneManifest(plan);
      assertNoDuplicateCoplanarWalls(plan.templateId, manifest.wallVolumes);
    }
  });

  it("closes the outer envelope on every bounds edge of every template", () => {
    for (const summary of listGeometrySummaries()) {
      const plan = getPlanGeometry(summary.templateId);
      const manifest = buildLifeAnchorSceneManifest(plan);
      assertEnvelopeClosed(plan, manifest.wallVolumes);
    }
  });

  it("places every opening on a wall segment that survived clipping", () => {
    for (const summary of listGeometrySummaries()) {
      const plan = getPlanGeometry(summary.templateId);
      const manifest = buildLifeAnchorSceneManifest(plan);
      assertOpeningsOnSurvivingWalls(plan.templateId, manifest.openings, manifest.wallVolumes);
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
    const expectedMeshes =
      plan.rooms.length + buildLifeAnchorSceneManifest(plan).wallVolumes.length + plan.fixedElements.length + plan.openings.length + 1;
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
