import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import * as THREE from "three";
import { hashBytes, hashString } from "@/lib/imageHash";
import { isPngImage } from "@/lib/png";
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
const ANCHOR_RENDERER_VERSION = "orthographic-apertures-v2";

export type LifeAnchorSource = "cache-png" | "deterministic-svg" | "request-png";

export interface LifeAnchorCachePath {
  templateId: TemplateId;
  relativePath: string;
  absolutePath: string;
  metadataAbsolutePath: string;
  directory: string;
}

export interface LifeAnchorSceneManifest {
  templateId: TemplateId;
  cachePath: string;
  relativeCachePath: string;
  viewport: typeof VIEWPORT;
  camera: {
    kind: "orthographic";
    position: [number, number, number];
    lookAt: [number, number, number];
    left: number;
    right: number;
    top: number;
    bottom: number;
    aspect: number;
    near: number;
    far: number;
    up: [number, number, number];
  };
  metadata: {
    tier: typeof ANCHOR_TIER;
    source: "three-orthographic-greybox-scene-manifest";
    complianceTruth: false;
    geometrySource: PlanGeometry["source"];
    hdbCeilingHeightM: typeof HDB_CEILING_HEIGHT_M;
    topologyProof: string;
    geometryIssues: string[];
    note: string;
  };
  rooms: LifeAnchorRoom[];
  wallVolumes: LifeAnchorWallVolume[];
  openings: LifeAnchorOpening[];
  fixedElements: LifeAnchorFixedElement[];
  serviceYardAffordances: LifeAnchorServiceFixture[];
}

export interface LifeAnchorRoom {
  id: string;
  label: string;
  kind: RoomGeometry["kind"];
  confidence: RoomGeometry["confidence"];
  renderable: boolean;
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
  renderable: boolean;
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

// Visual-only service-yard affordances: a washer/dryer stack and a floor drain
// derived deterministically from rooms with kind === "service". These are NOT
// part of the compliance schema — they do not appear in plan.fixedElements and
// have no airflow, kanso-reserve, or token-rule consequences. Their only role
// is to make a Singapore HDB service yard read as a service yard in both the
// camera-view greybox (Image 1) and the deterministic sumi-e fallback (Image 2),
// so GPT Image 2 materializes a washer and drain rather than a blank alcove.
export interface LifeAnchorServiceFixture {
  roomId: string;
  kind: "washer_stack" | "floor_drain";
  position: [number, number, number];
  scale: [number, number, number];
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

export function lifeAnchorSketchCacheKey(templateId: TemplateId): string {
  return `life-anchor:${templateId}`;
}

export function clearLifeAnchorByteCache(): void {
  // Compatibility with callers that previously reset the process byte cache.
  // Read the small on-disk artifacts each time so rebakes and cache roots agree.
}

export interface LifeAnchorPngRenderInput {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
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
    metadataAbsolutePath: join(cacheRoot, "life-anchors", templateId, "anchor.json"),
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

function createServiceFixtureMaterial(kind: LifeAnchorServiceFixture["kind"]): THREE.MeshPhysicalMaterial {
  if (kind === "washer_stack") {
    return new THREE.MeshPhysicalMaterial({
      color: 0xeae3d4,
      metalness: 0.08,
      roughness: 0.42,
      clearcoat: 0.18,
      clearcoatRoughness: 0.42,
    });
  }
  return new THREE.MeshPhysicalMaterial({
    color: 0x6b6259,
    metalness: 0.16,
    roughness: 0.6,
  });
}

// Service-yard affordances are derived from rooms (kind === "service") rather
// than from plan.fixedElements: the compliance schema does not model washers or
// drains, and we do not want them to leak into kanso-reserve, token, or wind
// rules. The placement rule is deterministic per templateId so every render is
// stable: washer stack in the first unobstructed corner, floor drain near the
// louvre side of the room center. Never cover a protected pipeshaft opening.
const SERVICE_FIXTURE_INSET_M = 0.05;
const WASHER_STACK_WIDTH_M = 0.62;
const WASHER_STACK_DEPTH_M = 0.62;
const WASHER_STACK_HEIGHT_M = 1.72;
const FLOOR_DRAIN_SIDE_M = 0.22;
const FLOOR_DRAIN_HEIGHT_M = 0.04;

function buildServiceYardAffordances(plan: PlanGeometry): LifeAnchorServiceFixture[] {
  const fixtures: LifeAnchorServiceFixture[] = [];
  for (const room of plan.rooms) {
    if (room.kind !== "service") continue;

    const washerHalfX = WASHER_STACK_WIDTH_M / 2;
    const washerHalfZ = WASHER_STACK_DEPTH_M / 2;
    const cornerXs = [room.x + washerHalfX + SERVICE_FIXTURE_INSET_M, room.x + room.width - washerHalfX - SERVICE_FIXTURE_INSET_M];
    const cornerZs = [room.y + washerHalfZ + SERVICE_FIXTURE_INSET_M, room.y + room.height - washerHalfZ - SERVICE_FIXTURE_INSET_M];
    const washerPosition = cornerZs.flatMap((z) => cornerXs.map((x) => ({ x, z }))).find(({ x, z }) => {
      if (x - washerHalfX < room.x || x + washerHalfX > room.x + room.width ||
          z - washerHalfZ < room.y || z + washerHalfZ > room.y + room.height) return false;
      const fixedCollision = plan.fixedElements.some((element) => element.kind !== "wet_zone" &&
        x + washerHalfX > element.x && x - washerHalfX < element.x + element.width &&
        z + washerHalfZ > element.y && z - washerHalfZ < element.y + element.height);
      const openingCollision = plan.openings.some((opening) => opening.roomIds.includes(room.id) &&
        x + washerHalfX + SERVICE_FIXTURE_INSET_M > Math.min(opening.start.x, opening.end.x) &&
        x - washerHalfX - SERVICE_FIXTURE_INSET_M < Math.max(opening.start.x, opening.end.x) &&
        z + washerHalfZ + SERVICE_FIXTURE_INSET_M > Math.min(opening.start.y, opening.end.y) &&
        z - washerHalfZ - SERVICE_FIXTURE_INSET_M < Math.max(opening.start.y, opening.end.y));
      return !fixedCollision && !openingCollision;
    });
    if (washerPosition) {
      fixtures.push({
        roomId: room.id,
        kind: "washer_stack",
        position: [washerPosition.x, WASHER_STACK_HEIGHT_M / 2, washerPosition.z],
        scale: [WASHER_STACK_WIDTH_M, WASHER_STACK_HEIGHT_M, WASHER_STACK_DEPTH_M],
      });
    }

    const drainX = room.x + room.width / 2;
    const drainZ = room.y + room.height * 0.62;
    fixtures.push({
      roomId: room.id,
      kind: "floor_drain",
      position: [drainX, FLOOR_DRAIN_HEIGHT_M / 2, drainZ],
      scale: [FLOOR_DRAIN_SIDE_M, FLOOR_DRAIN_HEIGHT_M, FLOOR_DRAIN_SIDE_M],
    });
  }
  return fixtures;
}

function createServiceFixtureMesh(fixture: LifeAnchorServiceFixture): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(fixture.scale[0], fixture.scale[1], fixture.scale[2]);
  const material = createServiceFixtureMaterial(fixture.kind);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `service_fixture:${fixture.roomId}:${fixture.kind}`;
  mesh.position.set(fixture.position[0], fixture.position[1], fixture.position[2]);
  return mesh;
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

function selectCameraRig(plan: PlanGeometry): CameraRig {
  const planCenter = centerOf(plan.bounds);
  const distance = Math.max(plan.bounds.width, plan.bounds.height) * 1.5;
  return {
    position: [planCenter.x + distance, 0.9 + distance, planCenter.y + distance],
    lookAt: [planCenter.x, 0.9, planCenter.y],
  };
}

function buildCamera(plan: PlanGeometry): THREE.OrthographicCamera {
  const rig = selectCameraRig(plan);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(...rig.position);
  camera.up.set(0, 1, 0);
  camera.lookAt(...rig.lookAt);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  // Orthographic axonometric projection preserves relative room sizes. Fit
  // the complete wall-height envelope with an 8% border in each dimension.
  const viewBounds = new THREE.Box3();
  for (const x of [plan.bounds.x - WALL_THICKNESS_M, plan.bounds.x + plan.bounds.width + WALL_THICKNESS_M]) {
    for (const z of [plan.bounds.y - WALL_THICKNESS_M, plan.bounds.y + plan.bounds.height + WALL_THICKNESS_M]) {
      for (const y of [-FLOOR_SLAB_HEIGHT_M, HDB_CEILING_HEIGHT_M]) {
        viewBounds.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
      }
    }
  }
  const center = viewBounds.getCenter(new THREE.Vector3());
  const size = viewBounds.getSize(new THREE.Vector3());
  const aspect = VIEWPORT.width / VIEWPORT.height;
  const halfHeight = Math.max(size.y / 2, size.x / (2 * aspect)) / 0.92;
  const halfWidth = halfHeight * aspect;
  camera.left = center.x - halfWidth;
  camera.right = center.x + halfWidth;
  camera.top = center.y + halfHeight;
  camera.bottom = center.y - halfHeight;
  camera.far = Math.max(camera.far, -viewBounds.min.z + 1);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function createOpeningMesh(opening: OpeningGeometry): THREE.Mesh {
  const spec = openingManifest(opening);
  const geometry = new THREE.BoxGeometry(...spec.scale);
  const material = createOpeningMaterial(opening);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `opening:${opening.id}`;
  mesh.position.set(...spec.position);
  mesh.rotation.y = spec.rotationY;
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

function enclosingShelter(plan: PlanGeometry, room: RoomGeometry): FixedElementGeometry | undefined {
  if (room.kind === "shelter") return undefined;
  return plan.fixedElements.find((element) => element.kind === "household_shelter" &&
    room.x >= element.x - WALL_CLIP_EPS && room.y >= element.y - WALL_CLIP_EPS &&
    room.x + room.width <= element.x + element.width + WALL_CLIP_EPS &&
    room.y + room.height <= element.y + element.height + WALL_CLIP_EPS);
}

function openingInsideShelter(plan: PlanGeometry, opening: OpeningGeometry): boolean {
  return plan.fixedElements.some((element) => element.kind === "household_shelter" &&
    [opening.start, opening.end].every((point) => point.x > element.x + WALL_CLIP_EPS &&
      point.x < element.x + element.width - WALL_CLIP_EPS && point.y > element.y + WALL_CLIP_EPS &&
      point.y < element.y + element.height - WALL_CLIP_EPS));
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
      // The protected shelter takes precedence over an overlapping room
      // extent. Never derive an internal partition from an ambiguous entry.
      if (r.kind === "shelter" && room.kind !== "shelter") return true;
      if (room.kind === "shelter" && r.kind !== "shelter") return false;
      const otherArea = r.width * r.height;
      if (otherArea < roomArea) return true;
      if (otherArea === roomArea) return r.id < room.id;
      return false;
    });
    if (!emitsDedicatedWalls(room) || enclosingShelter(plan, room)) continue;

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

  return walls.flatMap((wall) => cutWallOpenings(wall, plan.openings));
}

function cutWallOpenings(wall: LifeAnchorWallVolume, openings: OpeningGeometry[]): LifeAnchorWallVolume[] {
  const horizontal = wall.edge === "north" || wall.edge === "south";
  const alongAxis = horizontal ? 0 : 2;
  const perpAxis = horizontal ? 2 : 0;
  let pieces = [wall];
  for (const opening of openings) {
    const spec = openingManifest(opening);
    if (Math.abs(spec.start[perpAxis] - wall.position[perpAxis]) > WALL_CLIP_EPS ||
        Math.abs(spec.end[perpAxis] - wall.position[perpAxis]) > WALL_CLIP_EPS) continue;
    const cutLo = Math.min(spec.start[alongAxis], spec.end[alongAxis]);
    const cutHi = Math.max(spec.start[alongAxis], spec.end[alongAxis]);
    const cutBottom = spec.position[1] - spec.scale[1] / 2;
    const cutTop = spec.position[1] + spec.scale[1] / 2;
    pieces = pieces.flatMap((piece) => {
      const lo = piece.position[alongAxis] - piece.scale[alongAxis] / 2;
      const hi = piece.position[alongAxis] + piece.scale[alongAxis] / 2;
      const bottom = piece.position[1] - piece.scale[1] / 2;
      const top = piece.position[1] + piece.scale[1] / 2;
      const overlapLo = Math.max(lo, cutLo);
      const overlapHi = Math.min(hi, cutHi);
      const overlapBottom = Math.max(bottom, cutBottom);
      const overlapTop = Math.min(top, cutTop);
      if (overlapHi - overlapLo <= WALL_CLIP_EPS || overlapTop - overlapBottom <= WALL_CLIP_EPS) return [piece];
      return [
        [lo, overlapLo, bottom, top],
        [overlapHi, hi, bottom, top],
        [overlapLo, overlapHi, bottom, overlapBottom],
        [overlapLo, overlapHi, overlapTop, top],
      ].filter(([start, end, low, high]) => end - start > WALL_CLIP_EPS && high - low > WALL_CLIP_EPS)
        .map(([start, end, low, high]) => {
          const position: [number, number, number] = [...piece.position];
          const scale: [number, number, number] = [...piece.scale];
          position[alongAxis] = (start + end) / 2;
          position[1] = (low + high) / 2;
          scale[alongAxis] = end - start;
          scale[1] = high - low;
          return { ...piece, position, scale };
        });
    });
  }
  return pieces;
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
    renderable: true,
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
    if (enclosingShelter(plan, room)) continue;
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
    if (openingInsideShelter(plan, opening)) continue;
    scene.add(createOpeningMesh(opening));
  }

  const shaft = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 1.2, 0.18),
    createPipeshaftMarkerMaterial(),
  );
  shaft.name = `pipeshaft:${plan.pipeshaft.id}`;
  shaft.position.set(plan.pipeshaft.openingPoint.x, 0.72, plan.pipeshaft.openingPoint.y);
  scene.add(shaft);

  for (const fixture of buildServiceYardAffordances(plan)) {
    scene.add(createServiceFixtureMesh(fixture));
  }

  const camera = buildCamera(plan);
  return { scene, camera, manifest: buildLifeAnchorSceneManifest(plan, undefined, camera) };
}

export function buildLifeAnchorSceneManifest(
  plan: PlanGeometry,
  cacheRoot?: string,
  camera: THREE.OrthographicCamera = buildCamera(plan),
): LifeAnchorSceneManifest {
  const cache = getLifeAnchorCachePath(plan.templateId, cacheRoot);
  const rig = selectCameraRig(plan);
  const lookAt = camera.position.clone().addScaledVector(camera.getWorldDirection(new THREE.Vector3()), camera.position.distanceTo(new THREE.Vector3(...rig.lookAt)));

  return {
    templateId: plan.templateId,
    cachePath: cache.absolutePath,
    relativeCachePath: cache.relativePath,
    viewport: VIEWPORT,
    camera: {
      kind: "orthographic",
      position: [camera.position.x, camera.position.y, camera.position.z],
      lookAt: [lookAt.x, lookAt.y, lookAt.z],
      left: camera.left,
      right: camera.right,
      top: camera.top,
      bottom: camera.bottom,
      aspect: VIEWPORT.width / VIEWPORT.height,
      near: camera.near,
      far: camera.far,
      up: [camera.up.x, camera.up.y, camera.up.z],
    },
    metadata: {
      tier: ANCHOR_TIER,
      source: "three-orthographic-greybox-scene-manifest",
      complianceTruth: false,
      geometrySource: plan.source,
      hdbCeilingHeightM: HDB_CEILING_HEIGHT_M,
      topologyProof: `plan-sketches/${plan.templateId}/plan.png`,
      geometryIssues: plan.rooms.flatMap((room) => {
        const shelter = enclosingShelter(plan, room);
        return shelter ? [`${room.id} lies inside protected ${shelter.id}; verify the curated entry and shelter locations before image generation.`] : [];
      }),
      note: "Camera-view greybox reference only. Compliance geometry and token legality remain owned by plan-geometry.json and deterministic rules.",
    },
    rooms: plan.rooms.map((room) => ({
      id: room.id,
      label: room.label,
      kind: room.kind,
      confidence: room.confidence,
      renderable: !enclosingShelter(plan, room),
      position: centerRect(room, -FLOOR_SLAB_HEIGHT_M / 2),
      scale: rectScale(room),
    })),
    wallVolumes: buildWallVolumes(plan),
    openings: plan.openings.map((opening) => ({ ...openingManifest(opening), renderable: !openingInsideShelter(plan, opening) })),
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
    serviceYardAffordances: buildServiceYardAffordances(plan),
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

export interface LifeAnchorCacheMetadata {
  templateId: TemplateId;
  rendererVersion: string;
  manifestHash: string;
  pngHash: string;
}

export function lifeAnchorManifestHash(manifest: LifeAnchorSceneManifest): string {
  const scene = { ...manifest, cachePath: undefined, relativeCachePath: undefined };
  return hashString(JSON.stringify({ rendererVersion: ANCHOR_RENDERER_VERSION, scene }));
}

export function buildLifeAnchorCacheMetadata(manifest: LifeAnchorSceneManifest, png: Buffer): LifeAnchorCacheMetadata {
  return {
    templateId: manifest.templateId,
    rendererVersion: ANCHOR_RENDERER_VERSION,
    manifestHash: lifeAnchorManifestHash(manifest),
    pngHash: hashBytes(png),
  };
}

export async function resolveLifeAnchorArtifact(
  plan: PlanGeometry,
  options: ResolveLifeAnchorOptions = {},
): Promise<LifeAnchorArtifact> {
  const cache = getLifeAnchorCachePath(plan.templateId, options.cacheRoot);
  const manifest = buildLifeAnchorSceneManifest(plan, options.cacheRoot);

  try {
    const [png, rawMetadata] = await Promise.all([
      readFile(/*turbopackIgnore: true*/ cache.absolutePath),
      readFile(/*turbopackIgnore: true*/ cache.metadataAbsolutePath, "utf8"),
    ]);
    const metadata = JSON.parse(rawMetadata) as LifeAnchorCacheMetadata | null;
    const expected = buildLifeAnchorCacheMetadata(manifest, png);
    if (isPngImage(png) && metadata?.templateId === expected.templateId &&
        metadata.rendererVersion === expected.rendererVersion && metadata.manifestHash === expected.manifestHash &&
        metadata.pngHash === expected.pngHash) {
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
