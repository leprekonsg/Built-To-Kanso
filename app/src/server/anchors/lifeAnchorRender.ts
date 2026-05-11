import * as THREE from "three";
import type { LifeAnchorSceneManifest } from "./lifeAnchor";

interface ScreenPoint {
  x: number;
  y: number;
  distance: number;
}

interface Face {
  id: string;
  fill: string;
  stroke: string;
  opacity: number;
  points: ScreenPoint[];
}

const COLORS = {
  background: "#F5F1E8",
  floor: "#EFE9DC",
  wall: "#D8D0C2",
  wallStroke: "#9B9184",
  fixed: "#7F776C",
  hs: "#6E675D",
  wet: "#9A8F82",
  pipeshaft: "#B96F4D",
  door: "#D8A24A",
  window: "#7C856D",
  louver: "#A79F93",
  shadow: "rgba(17, 17, 17, 0.08)",
} as const;

export function renderLifeAnchorSceneSvg(manifest: LifeAnchorSceneManifest): string {
  const faces = projectManifestFaces(manifest);

  const polygons = faces
    .filter((face) => face.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)))
    .map((face) => {
      const points = face.points.map((point) => `${round(point.x)},${round(point.y)}`).join(" ");
      return `<polygon data-anchor-face="${escapeAttr(face.id)}" points="${points}" fill="${face.fill}" fill-opacity="${face.opacity}" stroke="${face.stroke}" stroke-opacity="0.52" stroke-width="1.1"/>`;
    })
    .join("");

  const { width, height } = manifest.viewport;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-anchor-source="${escapeAttr(manifest.metadata.source)}" data-render-watermark="draft">`,
    `<title>Life Sketch camera-view greybox anchor for ${escapeAttr(manifest.templateId)}</title>`,
    "<desc>Deterministic perspective anchor generated from locked plan geometry. No generated geometry is compliance truth.</desc>",
    `<rect width="100%" height="100%" fill="${COLORS.background}"/>`,
    `<ellipse cx="${round(width * 0.5)}" cy="${round(height * 0.86)}" rx="${round(width * 0.33)}" ry="${round(height * 0.12)}" fill="${COLORS.shadow}"/>`,
    polygons,
    "</svg>",
  ].join("");
}

export function renderLifeSketchSumiSvg(manifest: LifeAnchorSceneManifest): string {
  const faces = projectManifestFaces(manifest);
  const seed = seedForTemplate(manifest.templateId);
  const polygons = faces
    .filter((face) => face.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)))
    .map((face) => {
      const points = face.points.map((point) => `${round(point.x)},${round(point.y)}`).join(" ");
      return `<polygon data-life-face="${escapeAttr(face.id)}" points="${points}" fill="${sumiFill(face)}" fill-opacity="${sumiOpacity(face)}" stroke="${sumiStroke(face)}" stroke-opacity="${sumiStrokeOpacity(face)}" stroke-width="${sumiStrokeWidth(face)}" filter="url(#sumi-paper-edge)"/>`;
    })
    .join("");
  const { width, height } = manifest.viewport;
  const centerX = round(width * 0.5);
  const floorY = round(height * 0.84);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-anchor-source="${escapeAttr(manifest.metadata.source)}" data-life-sketch-source="deterministic-sumi-e" data-evidence-tier="${manifest.metadata.tier}" data-render-watermark="draft">`,
    `<title>Deterministic sumi-e Life Sketch for ${escapeAttr(manifest.templateId)}</title>`,
    "<desc>Deterministic Life Sketch derived from the locked camera-view Three.js anchor manifest. No generated geometry is compliance truth.</desc>",
    "<defs>",
    `<filter id="washi-grain" x="0" y="0" width="100%" height="100%">`,
    `<feTurbulence type="fractalNoise" baseFrequency="0.012 0.018" numOctaves="3" seed="${seed}" result="grain"/>`,
    `<feColorMatrix in="grain" type="matrix" values="0.16 0 0 0 0.79 0 0.14 0 0 0.74 0 0 0.11 0 0.66 0 0 0 0.16 0" result="paper"/>`,
    `<feBlend in="SourceGraphic" in2="paper" mode="multiply"/>`,
    "</filter>",
    `<filter id="sumi-paper-edge" x="-5%" y="-5%" width="110%" height="110%">`,
    `<feTurbulence type="fractalNoise" baseFrequency="0.028 0.044" numOctaves="2" seed="${seed + 17}" result="noise"/>`,
    `<feDisplacementMap in="SourceGraphic" in2="noise" scale="1.4" xChannelSelector="R" yChannelSelector="G"/>`,
    "</filter>",
    `<radialGradient id="west-sun-wash" cx="77%" cy="22%" r="72%">`,
    `<stop offset="0%" stop-color="#D8A24A" stop-opacity="0.18"/>`,
    `<stop offset="42%" stop-color="#E5C37A" stop-opacity="0.08"/>`,
    `<stop offset="100%" stop-color="#F5F1E8" stop-opacity="0"/>`,
    "</radialGradient>",
    "</defs>",
    `<rect width="100%" height="100%" fill="${COLORS.background}" filter="url(#washi-grain)"/>`,
    `<rect width="100%" height="100%" fill="url(#west-sun-wash)"/>`,
    `<ellipse cx="${centerX}" cy="${floorY}" rx="${round(width * 0.34)}" ry="${round(height * 0.13)}" fill="#111111" opacity="0.055"/>`,
    `<g data-layer="locked-anchor-materialized-surfaces">`,
    polygons,
    "</g>",
    `<path data-layer="sumi-grounding-stroke" d="M ${round(width * 0.18)} ${round(height * 0.88)} C ${round(width * 0.34)} ${round(height * 0.82)}, ${round(width * 0.68)} ${round(height * 0.82)}, ${round(width * 0.84)} ${round(height * 0.88)}" fill="none" stroke="#111111" stroke-opacity="0.16" stroke-width="2.2" stroke-linecap="round"/>`,
    "</svg>",
  ].join("");
}

function projectManifestFaces(manifest: LifeAnchorSceneManifest): Face[] {
  const camera = cameraFromManifest(manifest);
  const faces: Face[] = [];

  for (const room of manifest.rooms) {
    faces.push(
      ...cuboidFaces({
        id: `room:${room.id}`,
        position: room.position,
        scale: room.scale,
        fill: COLORS.floor,
        stroke: "rgba(17, 17, 17, 0.16)",
        opacity: room.confidence === "black" ? 0.5 : 0.76,
        camera,
        manifest,
        includeBottom: false,
      }),
    );
  }

  for (const wall of manifest.wallVolumes) {
    faces.push(
      ...cuboidFaces({
        id: `wall:${wall.roomId}:${wall.edge}`,
        position: wall.position,
        scale: wall.scale,
        fill: COLORS.wall,
        stroke: COLORS.wallStroke,
        opacity: 0.58,
        camera,
        manifest,
        includeBottom: false,
      }),
    );
  }

  for (const element of manifest.fixedElements) {
    const fill =
      element.kind === "pipeshaft_opening"
        ? COLORS.pipeshaft
        : element.kind === "household_shelter"
          ? COLORS.hs
          : element.kind === "wet_zone"
            ? COLORS.wet
            : COLORS.fixed;
    faces.push(
      ...cuboidFaces({
        id: `fixed:${element.id}`,
        position: element.position,
        scale: element.scale,
        fill,
        stroke: fill,
        opacity: element.kind === "pipeshaft_opening" ? 0.9 : 0.62,
        camera,
        manifest,
        includeBottom: false,
      }),
    );
  }

  for (const opening of manifest.openings) {
    const fill = opening.kind === "door" ? COLORS.door : opening.kind === "window" ? COLORS.window : COLORS.louver;
    faces.push(
      ...cuboidFaces({
        id: `opening:${opening.id}`,
        position: opening.position,
        scale: opening.scale,
        fill,
        stroke: fill,
        opacity: opening.operable ? 0.72 : 0.54,
        camera,
        manifest,
        rotationY: opening.rotationY,
        includeBottom: false,
      }),
    );
  }

  faces.sort((a, b) => averageDistance(b) - averageDistance(a));
  return faces;
}

function cameraFromManifest(manifest: LifeAnchorSceneManifest): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(
    manifest.camera.fov,
    manifest.camera.aspect,
    manifest.camera.near,
    manifest.camera.far,
  );
  camera.position.set(...manifest.camera.position);
  camera.up.set(...manifest.camera.up);
  camera.lookAt(...manifest.camera.lookAt);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function cuboidFaces(input: {
  id: string;
  position: [number, number, number];
  scale: [number, number, number];
  fill: string;
  stroke: string;
  opacity: number;
  camera: THREE.PerspectiveCamera;
  manifest: LifeAnchorSceneManifest;
  rotationY?: number;
  includeBottom: boolean;
}): Face[] {
  const [sx, sy, sz] = input.scale;
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const local = [
    [-hx, -hy, -hz],
    [hx, -hy, -hz],
    [hx, -hy, hz],
    [-hx, -hy, hz],
    [-hx, hy, -hz],
    [hx, hy, -hz],
    [hx, hy, hz],
    [-hx, hy, hz],
  ] as const;
  const rotation = input.rotationY ?? 0;
  const sin = Math.sin(rotation);
  const cos = Math.cos(rotation);
  const world = local.map(([x, y, z]) => {
    const rx = x * cos - z * sin;
    const rz = x * sin + z * cos;
    return new THREE.Vector3(input.position[0] + rx, input.position[1] + y, input.position[2] + rz);
  });
  const faces = [
    [0, 1, 2, 3],
    [4, 7, 6, 5],
    [0, 4, 5, 1],
    [1, 5, 6, 2],
    [2, 6, 7, 3],
    [3, 7, 4, 0],
  ];

  return faces
    .filter((_, index) => input.includeBottom || index !== 0)
    .map((indices, index) => ({
      id: `${input.id}:${index}`,
      fill: index === 1 ? lighten(input.fill) : input.fill,
      stroke: input.stroke,
      opacity: input.opacity,
      points: indices.map((idx) => project(world[idx], input.camera, input.manifest)),
    }));
}

function project(
  point: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
  manifest: LifeAnchorSceneManifest,
): ScreenPoint {
  const projected = point.clone().project(camera);
  return {
    x: ((projected.x + 1) / 2) * manifest.viewport.width,
    y: ((1 - projected.y) / 2) * manifest.viewport.height,
    distance: point.distanceTo(camera.position),
  };
}

function averageDistance(face: Face): number {
  return face.points.reduce((sum, point) => sum + point.distance, 0) / face.points.length;
}

function lighten(fill: string): string {
  if (fill === COLORS.floor) return "#F3EEE5";
  if (fill === COLORS.wall) return "#E5DED1";
  if (fill === COLORS.pipeshaft) return "#C78262";
  if (fill === COLORS.door) return "#E5B666";
  if (fill === COLORS.window) return "#929B83";
  if (fill === COLORS.louver) return "#B5AEA4";
  return fill;
}

function sumiFill(face: Face): string {
  if (face.id.startsWith("room:")) return "#F1EBE0";
  if (face.id.startsWith("wall:")) return "#DDD3C2";
  if (face.id.startsWith("fixed:") && face.fill === COLORS.pipeshaft) return "#B96F4D";
  if (face.id.startsWith("fixed:")) return "#7D756A";
  if (face.id.startsWith("opening:") && face.fill === COLORS.door) return "#D8A24A";
  if (face.id.startsWith("opening:") && face.fill === COLORS.window) return "#7C856D";
  if (face.id.startsWith("opening:")) return "#A79F93";
  return face.fill;
}

function sumiStroke(face: Face): string {
  if (face.id.startsWith("wall:")) return "#111111";
  if (face.id.startsWith("room:")) return "rgba(17, 17, 17, 0.34)";
  if (face.id.startsWith("fixed:") && face.fill === COLORS.pipeshaft) return "#8A4F39";
  if (face.id.startsWith("fixed:")) return "#111111";
  return face.fill;
}

function sumiOpacity(face: Face): string {
  if (face.id.startsWith("room:")) return "0.72";
  if (face.id.startsWith("wall:")) return "0.66";
  if (face.id.startsWith("fixed:") && face.fill === COLORS.pipeshaft) return "0.74";
  if (face.id.startsWith("fixed:")) return "0.42";
  if (face.id.startsWith("opening:")) return "0.68";
  return String(face.opacity);
}

function sumiStrokeOpacity(face: Face): string {
  if (face.id.startsWith("wall:")) return "0.42";
  if (face.id.startsWith("fixed:")) return "0.36";
  if (face.id.startsWith("opening:")) return "0.52";
  return "0.22";
}

function sumiStrokeWidth(face: Face): string {
  if (face.id.startsWith("wall:")) return "1.55";
  if (face.id.startsWith("fixed:")) return "1.2";
  if (face.id.startsWith("opening:")) return "1.35";
  return "0.8";
}

function seedForTemplate(templateId: string): number {
  let hash = 0;
  for (let i = 0; i < templateId.length; i += 1) {
    hash = (hash * 31 + templateId.charCodeAt(i)) % 9973;
  }
  return Math.max(1, hash);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function escapeAttr(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === '"') return "&quot;";
    return "&#39;";
  });
}
