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
import { renderLifeAnchorFallbackSvg } from "@/server/openai/fallbackSvg";

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
const CAMERA_PADDING_METERS = 1.2;

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
    kind: "orthographic";
    position: [number, number, number];
    lookAt: [number, number, number];
    left: number;
    right: number;
    top: number;
    bottom: number;
    near: number;
    far: number;
    up: [number, number, number];
  };
  metadata: {
    tier: typeof ANCHOR_TIER;
    source: "three-orthographic-scene-manifest";
    complianceTruth: false;
    geometrySource: PlanGeometry["source"];
    note: string;
  };
  rooms: LifeAnchorRoom[];
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
  operable: boolean;
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
// from re-reading R2 once-per-request inside the same process. Anchors are
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
  return 0x111111;
}

function openingColor(opening: OpeningGeometry): number {
  if (opening.kind === "door") return 0xd8a24a;
  if (opening.kind === "window") return 0x7c856d;
  return 0xa79f93;
}

function centerRect(rect: { x: number; y: number; width: number; height: number }): [number, number, number] {
  return [rect.x + rect.width / 2, 0, rect.y + rect.height / 2];
}

function rectScale(rect: { width: number; height: number }): [number, number, number] {
  return [rect.width, 0.08, rect.height];
}

function buildCamera(plan: PlanGeometry): THREE.OrthographicCamera {
  let halfWidth = plan.bounds.width / 2 + CAMERA_PADDING_METERS;
  let halfHeight = plan.bounds.height / 2 + CAMERA_PADDING_METERS;
  const viewportAspect = VIEWPORT.width / VIEWPORT.height;
  const planAspect = halfWidth / halfHeight;
  if (planAspect > viewportAspect) {
    halfHeight = halfWidth / viewportAspect;
  } else {
    halfWidth = halfHeight * viewportAspect;
  }
  const left = -halfWidth;
  const right = halfWidth;
  const top = halfHeight;
  const bottom = -halfHeight;
  const camera = new THREE.OrthographicCamera(left, right, top, bottom, 0.1, 100);
  camera.position.set(
    plan.bounds.x + plan.bounds.width / 2,
    24,
    plan.bounds.y + plan.bounds.height / 2,
  );
  camera.up.set(0, 0, -1);
  camera.lookAt(plan.bounds.x + plan.bounds.width / 2, 0, plan.bounds.y + plan.bounds.height / 2);
  camera.updateProjectionMatrix();
  return camera;
}

function createOpeningMesh(opening: OpeningGeometry): THREE.Mesh {
  const dx = opening.end.x - opening.start.x;
  const dz = opening.end.y - opening.start.y;
  const length = Math.max(0.08, Math.hypot(dx, dz));
  const thickness = opening.kind === "door" ? 0.12 : 0.08;
  const geometry = new THREE.BoxGeometry(length, 0.16, thickness);
  const material = new THREE.MeshLambertMaterial({ color: openingColor(opening) });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `opening:${opening.id}`;
  mesh.position.set((opening.start.x + opening.end.x) / 2, 0.18, (opening.start.y + opening.end.y) / 2);
  mesh.rotation.y = -Math.atan2(dz, dx);
  return mesh;
}

export function createLifeAnchorThreeScene(plan: PlanGeometry): LifeAnchorPngRenderInput {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf5f1e8);
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));

  const sun = new THREE.DirectionalLight(0xd8a24a, 0.7);
  sun.position.set(-4, 12, 8);
  scene.add(sun);

  for (const room of plan.rooms) {
    const geometry = new THREE.BoxGeometry(room.width, 0.08, room.height);
    const material = new THREE.MeshLambertMaterial({ color: roomColor(room) });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `room:${room.id}`;
    mesh.position.set(...centerRect(room));
    scene.add(mesh);
  }

  for (const element of plan.fixedElements) {
    const geometry = new THREE.BoxGeometry(element.width, 0.14, element.height);
    const material = new THREE.MeshLambertMaterial({ color: fixedColor(element), wireframe: true });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `fixed:${element.id}`;
    mesh.position.set(...centerRect(element));
    scene.add(mesh);
  }

  for (const opening of plan.openings) {
    scene.add(createOpeningMesh(opening));
  }

  const shaft = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 12, 8),
    new THREE.MeshLambertMaterial({ color: 0xb96f4d }),
  );
  shaft.name = `pipeshaft:${plan.pipeshaft.id}`;
  shaft.position.set(plan.pipeshaft.openingPoint.x, 0.18, plan.pipeshaft.openingPoint.y);
  scene.add(shaft);

  const camera = buildCamera(plan);
  return { scene, camera, manifest: buildLifeAnchorSceneManifest(plan, undefined, camera) };
}

export function buildLifeAnchorSceneManifest(
  plan: PlanGeometry,
  cacheRoot?: string,
  camera: THREE.OrthographicCamera = buildCamera(plan),
): LifeAnchorSceneManifest {
  const cache = getLifeAnchorCachePath(plan.templateId, cacheRoot);
  const lookAt: [number, number, number] = [
    plan.bounds.x + plan.bounds.width / 2,
    0,
    plan.bounds.y + plan.bounds.height / 2,
  ];

  return {
    templateId: plan.templateId,
    cachePath: cache.absolutePath,
    relativeCachePath: cache.relativePath,
    viewport: VIEWPORT,
    camera: {
      kind: "orthographic",
      position: [camera.position.x, camera.position.y, camera.position.z],
      lookAt,
      left: camera.left,
      right: camera.right,
      top: camera.top,
      bottom: camera.bottom,
      near: camera.near,
      far: camera.far,
      up: [camera.up.x, camera.up.y, camera.up.z],
    },
    metadata: {
      tier: ANCHOR_TIER,
      source: "three-orthographic-scene-manifest",
      complianceTruth: false,
      geometrySource: plan.source,
      note: "Reference imagery only. Compliance geometry and token legality remain owned by plan-geometry.json and deterministic rules.",
    },
    rooms: plan.rooms.map((room) => ({
      id: room.id,
      label: room.label,
      kind: room.kind,
      confidence: room.confidence,
      position: centerRect(room),
      scale: rectScale(room),
    })),
    openings: plan.openings.map((opening) => ({
      id: opening.id,
      kind: opening.kind,
      roomIds: [...opening.roomIds],
      start: [opening.start.x, 0.16, opening.start.y],
      end: [opening.end.x, 0.16, opening.end.y],
      operable: opening.operable,
    })),
    fixedElements: plan.fixedElements.map((element) => ({
      id: element.id,
      kind: element.kind,
      confidence: element.confidence,
      position: centerRect(element),
      scale: rectScale(element),
      bufferEligible: element.bufferEligible,
    })),
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
    svg: renderLifeAnchorFallbackSvg(plan),
  };
}
