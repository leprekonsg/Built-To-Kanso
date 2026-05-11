import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import * as THREE from "three";
import type {
  FixedElementGeometry,
  OpeningGeometry,
  PlanGeometry,
  RoomGeometry,
  TemplateId,
} from "@/server/geometry/types";
import { renderLifeAnchorSceneSvg } from "./lifeAnchorRender";

// R2 is OUT of Phase 1 as of 2026-05-09. Anchor resolution now reads only
// from the on-disk prebake cache, then falls back to deterministic SVG.
// `SketchCacheEnv` is re-exported as a thin compatibility type so test
// fixtures that pass an `env` object compile without change.
export interface SketchCacheEnv {
  [key: string]: string | undefined;
}

function defaultCacheRoot(): string {
  return process.env.LIFE_ANCHOR_CACHE_ROOT
    ? resolve(/*turbopackIgnore: true*/ process.env.LIFE_ANCHOR_CACHE_ROOT)
    : resolve(/*turbopackIgnore: true*/ process.cwd(), "public");
}
const ANCHOR_TIER = "prototype_visualisation" as const;
const VIEWPORT = { width: 1536, height: 1024 } as const;
const HDB_CEILING_HEIGHT_M = 2.6;
const FLOOR_SLAB_HEIGHT_M = 0.04;
const WALL_THICKNESS_M = 0.08;
const OPENING_DEPTH_M = 0.1;

export type LifeAnchorSource = "cache-png" | "deterministic-svg" | "request-png";

export interface LifeAnchorCachePath {
  templateId: TemplateId;
  relativePath: string;
  absolutePath: string;
  directory: string;
}

export interface LifeAnchorSceneManifest {
  templateId: TemplateId;
  cachePath: string;
  relativeCachePath: string;
  viewport: typeof VIEWPORT;
  camera: {
    kind: "perspective";
    position: [number, number, number];
    lookAt: [number, number, number];
    fov: number;
    aspect: number;
    near: number;
    far: number;
    up: [number, number, number];
  };
  metadata: {
    tier: typeof ANCHOR_TIER;
    source: "three-perspective-greybox-scene-manifest";
    complianceTruth: false;
    geometrySource: PlanGeometry["source"];
    hdbCeilingHeightM: typeof HDB_CEILING_HEIGHT_M;
    topologyProof: string;
    note: string;
  };
  rooms: LifeAnchorRoom[];
  wallVolumes: LifeAnchorWallVolume[];
  openings: LifeAnchorOpening[];
  fixedElements: LifeAnchorFixedElement[];
}

export interface LifeAnchorRoom {
  id: string;
  label: string;
  kind: RoomGeometry["kind"];
  confidence: RoomGeometry["confidence"];
  position: [number, number, number];
  scale: [number, number, number];
}

export interface LifeAnchorOpening {
  id: string;
  kind: OpeningGeometry["kind"];
  roomIds: string[];
  start: [number, number, number];
  end: [number, number, number];
  position: [number, number, number];
  scale: [number, number, number];
  rotationY: number;
  operable: boolean;
}

export interface LifeAnchorWallVolume {
  roomId: string;
  edge: "north" | "east" | "south" | "west";
  position: [number, number, number];
  scale: [number, number, number];
}

export interface LifeAnchorFixedElement {
  id: string;
  kind: FixedElementGeometry["kind"];
  confidence: FixedElementGeometry["confidence"];
  position: [number, number, number];
  scale: [number, number, number];
  bufferEligible?: boolean;
}

export type LifeAnchorArtifact =
  | {
      source: "cache-png";
      contentType: "image/png";
      cachePath: string;
      absoluteCachePath: string;
      manifest: LifeAnchorSceneManifest;
      png: Buffer;
    }
  | {
      source: "deterministic-svg";
      contentType: "image/svg+xml";
      cachePath: string;
      absoluteCachePath: string;
      manifest: LifeAnchorSceneManifest;
      svg: string;
    };

export interface ResolveLifeAnchorOptions {
  cacheRoot?: string;
  // Retained for API compatibility with prior R2-aware callers. R2 is OUT of
  // Phase 1 (2026-05-09) so this flag is now a no-op; anchors are resolved
  // from the local prebake cacheRoot then fall through to deterministic SVG.
  consultSketchCache?: boolean;
  env?: SketchCacheEnv;
}

// Per-template in-memory cache of resolved bytes. Keeps the route hot path
// from re-reading the committed local PNG once per request. Anchors are
// deterministic per templateId so this is safe.
const ANCHOR_BYTE_CACHE = new Map<TemplateId, { contentType: "image/png"; bytes: Buffer }>();

export function lifeAnchorSketchCacheKey(templateId: TemplateId): string {
  return `life-anchor:${templateId}`;
}

// Exposed for tests; resets the in-memory anchor byte cache.
export function clearLifeAnchorByteCache(): void {
  ANCHOR_BYTE_CACHE.clear();
}

export interface LifeAnchorPngRenderInput {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  manifest: LifeAnchorSceneManifest;
}

export interface LifeAnchorPngRenderer {
  renderPng(input: LifeAnchorPngRenderInput): Promise<Buffer>;
}

export type LifeAnchorPngRenderResult =
  | { ok: true; png: Buffer; manifest: LifeAnchorSceneManifest }
  | { ok: false; reason: "png_renderer_unavailable"; manifest: LifeAnchorSceneManifest };

export function getLifeAnchorCachePath(templateId: TemplateId, cacheRoot: string = defaultCacheRoot()): LifeAnchorCachePath {
  const relativePath = join("life-anchors", templateId, "anchor.png");
  const absolutePath = join(cacheRoot, relativePath);
  return {
    templateId,
    relativePath: relativePath.replaceAll("\\", "/"),
    absolutePath,
    directory: dirname(absolutePath),
  };
}

function roomColor(room: RoomGeometry): number {
  if (room.confidence === "black") return 0xddd6c8;
  if (room.confidence === "amber") return 0xf0d7a3;
  return 0xefe9dc;
}

function fixedColor(element: FixedElementGeometry): number {
  if (element.kind === "pipeshaft_opening") return 0xb96f4d;
  if (element.kind === "household_shelter") return 0x6e675d;
  if (element.kind === "wet_zone") return 0xa79f93;
  return 0x111111;
}

function openingColor(opening: OpeningGeometry): number {
  if (opening.kind === "door") return 0xd8a24a;
  if (opening.kind === "window") return 0x7c856d;
  return 0xa79f93;
}

function createFloorMaterial(room: RoomGeometry): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: roomColor(room),
    metalness: 0,
    roughness: 0.58,
    clearcoat: 0.34,
    clearcoatRoughness: 0.32,
  });
}

function createWallMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0xd8d0c2,
    metalness: 0,
    roughness: 0.88,
  });
}

function createOpeningMaterial(opening: OpeningGeometry): THREE.MeshPhysicalMaterial {
  if (opening.kind === "window") {
    return new THREE.MeshPhysicalMaterial({
      color: openingColor(opening),
      metalness: 0,
      roughness: 0.05,
      transmission: 0.85,
      thickness: 0.02,
      transparent: true,
      opacity: 0.58,
      side: THREE.DoubleSide,
    });
  }

  if (opening.kind === "louver") {
    return new THREE.MeshPhysicalMaterial({
      color: openingColor(opening),
      metalness: 0,
      roughness: 0.62,
      sheen: 0.35,
      sheenRoughness: 0.78,
    });
  }

  return new THREE.MeshPhysicalMaterial({
    color: openingColor(opening),
    metalness: 0,
    roughness: 0.48,
    clearcoat: 0.12,
    clearcoatRoughness: 0.4,
  });
}

function createFixedElementMaterial(element: FixedElementGeometry): THREE.MeshPhysicalMaterial {
  const opacity =
    element.kind === "pipeshaft_opening"
      ? 0.82
      : element.kind === "wet_zone"
        ? 0.28
        : element.kind === "household_shelter"
          ? 0.62
          : 0.5;

  return new THREE.MeshPhysicalMaterial({
    color: fixedColor(element),
    metalness: 0,
    roughness: element.kind === "pipeshaft_opening" ? 0.52 : 0.76,
    transparent: true,
    opacity,
  });
}

function createPipeshaftMarkerMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0xb96f4d,
    metalness: 0,
    roughness: 0.46,
    clearcoat: 0.18,
    clearcoatRoughness: 0.48,
  });
}

function centerRect(rect: { x: number; y: number; width: number; height: number }, y = 0): [number, number, number] {
  return [rect.x + rect.width / 2, y, rect.y + rect.height / 2];
}

function rectScale(rect: { width: number; height: number }): [number, number, number] {
  return [rect.width, FLOOR_SLAB_HEIGHT_M, rect.height];
}

interface CameraRig {
  position: [number, number, number];
  lookAt: [number, number, number];
}

function centerOf(rect: { x: number; y: number; width: number; height: number }) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function openingLength(opening: OpeningGeometry): number {
  return Math.hypot(opening.end.x - opening.start.x, opening.end.y - opening.start.y);
}

function openingMidpoint(opening: OpeningGeometry) {
  return {
    x: (opening.start.x + opening.end.x) / 2,
    y: (opening.start.y + opening.end.y) / 2,
  };
}

function selectPrimaryViewOpening(plan: PlanGeometry): OpeningGeometry {
  const livingWindow = plan.openings
    .filter((opening) => opening.kind !== "door" && opening.roomIds.some((id) => plan.rooms.find((room) => room.id === id)?.kind === "living"))
    .sort((a, b) => openingLength(b) - openingLength(a))[0];
  if (livingWindow) return livingWindow;
  return plan.openings
    .filter((opening) => opening.kind !== "door")
    .sort((a, b) => openingLength(b) - openingLength(a))[0] ?? plan.openings[0];
}

function selectCameraRig(plan: PlanGeometry): CameraRig {
  const living = plan.rooms.find((room) => room.kind === "living") ?? plan.rooms[0];
  const livingCenter = centerOf(living);
  const planCenter = centerOf(plan.bounds);
  const primaryOpening = selectPrimaryViewOpening(plan);
  const opening = openingMidpoint(primaryOpening);
  const direction = new THREE.Vector2(opening.x - livingCenter.x, opening.y - livingCenter.y);
  if (direction.lengthSq() < 0.01) direction.set(0, -1);
  direction.normalize();

  const cameraDistance = Math.max(plan.bounds.width, plan.bounds.height) * 1.0;
  const cameraPlanX = planCenter.x - direction.x * cameraDistance;
  const cameraPlanY = planCenter.y - direction.y * cameraDistance;
  const targetX = planCenter.x + direction.x * Math.min(1.1, openingLength(primaryOpening) * 0.3);
  const targetY = planCenter.y + direction.y * Math.min(1.1, openingLength(primaryOpening) * 0.3);

  return {
    position: [cameraPlanX, 7.2, cameraPlanY],
    lookAt: [targetX, 0.9, targetY],
  };
}

function buildCamera(plan: PlanGeometry): THREE.PerspectiveCamera {
  const rig = selectCameraRig(plan);
  const camera = new THREE.PerspectiveCamera(46, VIEWPORT.width / VIEWPORT.height, 0.1, 100);
  camera.position.set(...rig.position);
  camera.up.set(0, 1, 0);
  camera.lookAt(...rig.lookAt);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function createOpeningMesh(opening: OpeningGeometry): THREE.Mesh {
  const dx = opening.end.x - opening.start.x;
  const dz = opening.end.y - opening.start.y;
  const length = Math.max(0.08, Math.hypot(dx, dz));
  const height = opening.kind === "door" ? 2.05 : opening.kind === "window" ? 1.1 : 1.35;
  const sill = opening.kind === "door" ? 0.03 : opening.kind === "window" ? 0.88 : 0.7;
  const geometry = new THREE.BoxGeometry(length, height, OPENING_DEPTH_M);
  const material = createOpeningMaterial(opening);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `opening:${opening.id}`;
  mesh.position.set((opening.start.x + opening.end.x) / 2, sill + height / 2, (opening.start.y + opening.end.y) / 2);
  mesh.rotation.y = -Math.atan2(dz, dx);
  return mesh;
}

function createWallMesh(wall: LifeAnchorWallVolume): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(...wall.scale);
  const material = createWallMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `wall:${wall.roomId}:${wall.edge}`;
  mesh.position.set(...wall.position);
  return mesh;
}

// Room rects in plan-geometry.json overlap by convention (the rect encodes a
// room's max extent, the smaller room "wins" the overlap region in the topology
// proof). The 3D anchor must respect that convention or you get a Living/Dining
// wall slicing through Bedroom 3. Algorithm: emit four wall segments per room,
// then clip each segment against any OTHER room that "owns" the segment under
// the smaller-wins rule. Ownership covers two cases with the same code path:
//  - interior crossing: the segment's perpendicular coord is strictly inside
//    the other room's perpendicular extent (Living/Dining intruding into a
//    bedroom).
//  - party wall: the perpendicular coord sits on the other room's boundary
//    (two adjacent rooms sharing a wall). Without this case, both rooms emit a
//    coplanar mesh and the topology proof z-fights.
// One inclusive perpendicular test handles both.
const WALL_CLIP_EPS = 0.001;

interface Span {
  start: number;
  end: number;
}

function subtractSpan(spans: Span[], cut: Span): Span[] {
  const next: Span[] = [];
  for (const s of spans) {
    if (cut.end <= s.start + WALL_CLIP_EPS || cut.start >= s.end - WALL_CLIP_EPS) {
      next.push(s);
      continue;
    }
    if (cut.start > s.start + WALL_CLIP_EPS) next.push({ start: s.start, end: cut.start });
    if (cut.end < s.end - WALL_CLIP_EPS) next.push({ start: cut.end, end: s.end });
  }
  return next;
}

function clipWallSpan(
  initial: Span,
  perp: number,
  perpAxis: "x" | "z",
  others: ReadonlyArray<RoomGeometry>,
): Span[] {
  let spans: Span[] = [initial];
  for (const o of others) {
    const perpLo = perpAxis === "x" ? o.x : o.y;
    const perpHi = perpLo + (perpAxis === "x" ? o.width : o.height);
    // `o` owns this wall coord when `perp` is inside `o`'s perpendicular extent
    // OR on its boundary. Interior covers overlap-crossing; boundary covers
    // adjacent party walls. `o` is only in `others` if it won under the
    // smaller-wins rule, so this clip removes the segment from the losing
    // (bigger) room exactly when `o` is going to emit it instead.
    if (perp < perpLo - WALL_CLIP_EPS || perp > perpHi + WALL_CLIP_EPS) continue;
    const cutLo = perpAxis === "x" ? o.y : o.x;
    const cutHi = cutLo + (perpAxis === "x" ? o.height : o.width);
    spans = subtractSpan(spans, { start: cutLo, end: cutHi });
    if (spans.length === 0) return spans;
  }
  return spans;
}

function emitsDedicatedWalls(room: RoomGeometry): boolean {
  return room.kind !== "corridor";
}

function canClipRoomWall(owner: RoomGeometry, room: RoomGeometry): boolean {
  if (emitsDedicatedWalls(owner)) return true;
  return room.kind === "living" || room.kind === "entry" || room.kind === "kitchen" || room.kind === "service";
}

function buildWallVolumes(plan: PlanGeometry): LifeAnchorWallVolume[] {
  const walls: LifeAnchorWallVolume[] = [];
  const y = HDB_CEILING_HEIGHT_M / 2;

  for (const room of plan.rooms) {
    // Smaller rooms win the overlap region. Only clip this room's walls
    // against OTHER rooms that are strictly smaller in footprint; with equal
    // area we tiebreak by id so the choice is stable.
    const roomArea = room.width * room.height;
    const others = plan.rooms.filter((r) => {
      if (r.id === room.id) return false;
      if (!canClipRoomWall(r, room)) return false;
      const otherArea = r.width * r.height;
      if (otherArea < roomArea) return true;
      if (otherArea === roomArea) return r.id < room.id;
      return false;
    });
    if (!emitsDedicatedWalls(room)) continue;

    const east = room.x + room.width;
    const south = room.y + room.height;

    // North + south walls run along x. Their perpendicular coord is z (room.y axis).
    for (const edge of ["north", "south"] as const) {
      const perpZ = edge === "north" ? room.y : south;
      const spans = clipWallSpan({ start: room.x, end: east }, perpZ, "z", others);
      for (const span of spans) {
        const length = span.end - span.start;
        if (length <= WALL_CLIP_EPS) continue;
        walls.push({
          roomId: room.id,
          edge,
          position: [span.start + length / 2, y, perpZ],
          scale: [length, HDB_CEILING_HEIGHT_M, WALL_THICKNESS_M],
        });
      }
    }

    // East + west walls run along z. Their perpendicular coord is x.
    for (const edge of ["west", "east"] as const) {
      const perpX = edge === "west" ? room.x : east;
      const spans = clipWallSpan({ start: room.y, end: south }, perpX, "x", others);
      for (const span of spans) {
        const length = span.end - span.start;
        if (length <= WALL_CLIP_EPS) continue;
        walls.push({
          roomId: room.id,
          edge,
          position: [perpX, y, span.start + length / 2],
          scale: [WALL_THICKNESS_M, HDB_CEILING_HEIGHT_M, length],
        });
      }
    }
  }

  return walls;
}

function fixedElementHeight(element: FixedElementGeometry): number {
  if (element.kind === "pipeshaft_opening") return 1.45;
  if (element.kind === "wet_zone") return 0.06;
  return HDB_CEILING_HEIGHT_M;
}

function openingManifest(opening: OpeningGeometry): LifeAnchorOpening {
  const dx = opening.end.x - opening.start.x;
  const dz = opening.end.y - opening.start.y;
  const length = Math.max(0.08, Math.hypot(dx, dz));
  const height = opening.kind === "door" ? 2.05 : opening.kind === "window" ? 1.1 : 1.35;
  const sill = opening.kind === "door" ? 0.03 : opening.kind === "window" ? 0.88 : 0.7;
  return {
    id: opening.id,
    kind: opening.kind,
    roomIds: [...opening.roomIds],
    start: [opening.start.x, sill, opening.start.y],
    end: [opening.end.x, sill, opening.end.y],
    position: [(opening.start.x + opening.end.x) / 2, sill + height / 2, (opening.start.y + opening.end.y) / 2],
    scale: [length, height, OPENING_DEPTH_M],
    rotationY: -Math.atan2(dz, dx),
    operable: opening.operable,
  };
}

export function createLifeAnchorThreeScene(plan: PlanGeometry): LifeAnchorPngRenderInput {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf5f1e8);
  scene.add(new THREE.AmbientLight(0xffffff, 0.72));

  const sun = new THREE.DirectionalLight(0xd8a24a, 0.7);
  sun.position.set(-4, 8, -6);
  scene.add(sun);

  for (const room of plan.rooms) {
    const geometry = new THREE.BoxGeometry(room.width, FLOOR_SLAB_HEIGHT_M, room.height);
    const material = createFloorMaterial(room);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `room:${room.id}`;
    mesh.position.set(...centerRect(room, -FLOOR_SLAB_HEIGHT_M / 2));
    scene.add(mesh);
  }

  for (const wall of buildWallVolumes(plan)) {
    scene.add(createWallMesh(wall));
  }

  for (const element of plan.fixedElements) {
    const height = fixedElementHeight(element);
    const geometry = new THREE.BoxGeometry(element.width, height, element.height);
    const material = createFixedElementMaterial(element);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `fixed:${element.id}`;
    mesh.position.set(...centerRect(element, height / 2));
    scene.add(mesh);
  }

  for (const opening of plan.openings) {
    scene.add(createOpeningMesh(opening));
  }

  const shaft = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 1.2, 0.18),
    createPipeshaftMarkerMaterial(),
  );
  shaft.name = `pipeshaft:${plan.pipeshaft.id}`;
  shaft.position.set(plan.pipeshaft.openingPoint.x, 0.72, plan.pipeshaft.openingPoint.y);
  scene.add(shaft);

  const camera = buildCamera(plan);
  return { scene, camera, manifest: buildLifeAnchorSceneManifest(plan, undefined, camera) };
}

export function buildLifeAnchorSceneManifest(
  plan: PlanGeometry,
  cacheRoot?: string,
  camera: THREE.PerspectiveCamera = buildCamera(plan),
): LifeAnchorSceneManifest {
  const cache = getLifeAnchorCachePath(plan.templateId, cacheRoot);
  const rig = selectCameraRig(plan);

  return {
    templateId: plan.templateId,
    cachePath: cache.absolutePath,
    relativeCachePath: cache.relativePath,
    viewport: VIEWPORT,
    camera: {
      kind: "perspective",
      position: [camera.position.x, camera.position.y, camera.position.z],
      lookAt: rig.lookAt,
      fov: camera.fov,
      aspect: camera.aspect,
      near: camera.near,
      far: camera.far,
      up: [camera.up.x, camera.up.y, camera.up.z],
    },
    metadata: {
      tier: ANCHOR_TIER,
      source: "three-perspective-greybox-scene-manifest",
      complianceTruth: false,
      geometrySource: plan.source,
      hdbCeilingHeightM: HDB_CEILING_HEIGHT_M,
      topologyProof: `plan-sketches/${plan.templateId}/plan.png`,
      note: "Camera-view greybox reference only. Compliance geometry and token legality remain owned by plan-geometry.json and deterministic rules.",
    },
    rooms: plan.rooms.map((room) => ({
      id: room.id,
      label: room.label,
      kind: room.kind,
      confidence: room.confidence,
      position: centerRect(room, -FLOOR_SLAB_HEIGHT_M / 2),
      scale: rectScale(room),
    })),
    wallVolumes: buildWallVolumes(plan),
    openings: plan.openings.map(openingManifest),
    fixedElements: plan.fixedElements.map((element) => {
      const height = fixedElementHeight(element);
      return {
        id: element.id,
        kind: element.kind,
        confidence: element.confidence,
        position: centerRect(element, height / 2),
        scale: [element.width, height, element.height] as [number, number, number],
        bufferEligible: element.bufferEligible,
      };
    }),
  };
}

export async function renderLifeAnchorPng(
  plan: PlanGeometry,
  renderer?: LifeAnchorPngRenderer,
): Promise<LifeAnchorPngRenderResult> {
  const input = createLifeAnchorThreeScene(plan);
  try {
    if (!renderer) {
      return { ok: false, reason: "png_renderer_unavailable", manifest: input.manifest };
    }
    return { ok: true, png: await renderer.renderPng(input), manifest: input.manifest };
  } finally {
    disposeThreeScene(input.scene);
  }
}

function disposeThreeScene(scene: THREE.Scene): void {
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((item) => item.dispose());
    } else {
      material?.dispose();
    }
  });
  scene.clear();
}

function isPng(bytes: Buffer): boolean {
  return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

export async function resolveLifeAnchorArtifact(
  plan: PlanGeometry,
  options: ResolveLifeAnchorOptions = {},
): Promise<LifeAnchorArtifact> {
  const cache = getLifeAnchorCachePath(plan.templateId, options.cacheRoot);
  const manifest = buildLifeAnchorSceneManifest(plan, options.cacheRoot);

  // Fast path: in-memory cache populated by a prior on-disk read in this
  // process. Anchors are deterministic per templateId so this is safe.
  const memo = ANCHOR_BYTE_CACHE.get(plan.templateId);
  if (memo) {
    return {
      source: "cache-png",
      contentType: "image/png",
      cachePath: cache.relativePath,
      absoluteCachePath: cache.absolutePath,
      manifest,
      png: memo.bytes,
    };
  }

  try {
    const png = await readFile(/*turbopackIgnore: true*/ cache.absolutePath);
    if (isPng(png)) {
      ANCHOR_BYTE_CACHE.set(plan.templateId, { contentType: "image/png", bytes: png });
      return {
        source: "cache-png",
        contentType: "image/png",
        cachePath: cache.relativePath,
        absoluteCachePath: cache.absolutePath,
        manifest,
        png,
      };
    }
  } catch {
    // Missing cache is expected in local/test environments.
  }

  return {
    source: "deterministic-svg",
    contentType: "image/svg+xml",
    cachePath: cache.relativePath,
    absoluteCachePath: cache.absolutePath,
    manifest,
    svg: renderLifeAnchorSceneSvg(manifest),
  };
}
