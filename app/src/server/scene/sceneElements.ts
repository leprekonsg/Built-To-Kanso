/**
 * Scene-element responses for the Live Studio.
 *
 * Per brief §5.4 and Phase 1 build item 5, the Live Studio renders five
 * elements driven by the Material System: silk_ribbon, sunlit_dust, plus three
 * scene-element responses — curtain, monstera leaf, and the perforated
 * kitchen-partition shadow blend. The scene-element responses ride the
 * `plant_lean` material: they read local velocity at each anchor point and
 * tilt/skew/blend in deterministic response.
 *
 * This module computes the specs (anchor positions, sway angles, shadow frame
 * indices) deterministically from plan geometry and a Tier 4 velocity sample
 * set. It does NOT render. LiveStudio.tsx renders.
 */

import type { OpeningGeometry, PlanGeometry, RoomGeometry } from "@/server/geometry/types";
import type { Tier4SimulationField, VelocitySample } from "@/server/simulation/types";

/**
 * Sway angle (degrees) is clamped so curtains/leaves never look hyperreal.
 * 22° is the maximum tilt at full visibility under a fast cross-breeze.
 */
const MAX_SWAY_DEG = 22;
/**
 * Speed (m/s) at which the response saturates. Above this, sway stays at MAX.
 * 1.6 m/s is the Yuan & Ng (2012) tropical pedestrian comfort floor — the same
 * threshold Resonance Hours uses for "the wind is in conversation".
 */
const SWAY_SATURATION_MPS = 1.6;
/**
 * Eight pre-baked shadow textures per element, per brief §13. Frames cycle
 * based on local velocity at the kitchen-partition anchor. Stable across
 * re-renders so the scene reads as deterministic, not noisy.
 */
export const SHADOW_FRAME_COUNT = 8;

export interface CurtainSpec {
  /** Stable id for React keying. */
  id: string;
  /** Window opening this curtain hangs from. */
  openingId: string;
  /** Anchor centerpoint in plan meters (top of window). */
  anchor: { x: number; y: number };
  /** Window width in plan meters. */
  spanM: number;
  /** Window orientation: "horizontal" hangs vertically, "vertical" drapes sideways. */
  orientation: "horizontal" | "vertical";
  /** Sway angle in degrees, signed by velocity direction across the opening. */
  swayDeg: number;
  /** Local airflow speed at the window (m/s). */
  speedMps: number;
}

export interface LeafSpec {
  id: string;
  /** Anchor in plan meters. */
  anchor: { x: number; y: number };
  /** Rotation (deg) of the leaf relative to its rest position. */
  rotationDeg: number;
  /** Local velocity speed at the leaf (m/s). */
  speedMps: number;
}

export interface KitchenShadowSpec {
  /** Center of the kitchen room in plan meters. */
  anchor: { x: number; y: number };
  /** Kitchen room footprint, used as the shadow surface. */
  bounds: { x: number; y: number; width: number; height: number };
  /** Active frame index, 0..SHADOW_FRAME_COUNT-1. */
  frameIndex: number;
  /** Blend opacity, 0..1. Coupled to local velocity magnitude. */
  blendOpacity: number;
  /** Local velocity speed at kitchen center (m/s). */
  speedMps: number;
}

export interface SceneElementSpec {
  curtains: CurtainSpec[];
  leaves: LeafSpec[];
  kitchenShadow: KitchenShadowSpec | null;
}

/**
 * Build the full scene-element spec for a plan + velocity field.
 *
 * Pure: same plan + same field => same output. This is intentional — it lets
 * us test deterministically and keeps the scene-element layer indistinguishable
 * between Tier 1 (live LBM) and Tier 4 (pre-baked) per Hard Rule #14.
 */
export function buildSceneElementSpec(plan: PlanGeometry, field: Tier4SimulationField): SceneElementSpec {
  const samples = field.velocitySamples;
  return {
    curtains: buildCurtains(plan, samples),
    leaves: buildLeaves(plan, samples),
    kitchenShadow: buildKitchenShadow(plan, samples),
  };
}

function buildCurtains(plan: PlanGeometry, samples: VelocitySample[]): CurtainSpec[] {
  return plan.openings
    .filter((opening) => opening.kind === "window" && opening.operable)
    .map((opening) => {
      const anchor = openingMidpoint(opening);
      const orientation = openingOrientation(opening);
      const sample = nearestSample(samples, anchor);
      const speedMps = sample?.speedMps ?? 0;
      const swayDeg = curtainSwayDeg(orientation, sample);
      return {
        id: `curtain-${opening.id}`,
        openingId: opening.id,
        anchor,
        spanM: openingSpan(opening),
        orientation,
        swayDeg,
        speedMps,
      };
    });
}

function buildLeaves(plan: PlanGeometry, samples: VelocitySample[]): LeafSpec[] {
  /**
   * Leaves anchor in the living room corners and one bedroom corner. We pick
   * the largest living/dining room (by area) for the primary leaf and the
   * largest bedroom for a secondary leaf. Determinism: tied areas resolve by
   * room id alphabetical order.
   */
  const livingRoom = pickLargestRoom(plan.rooms, "living");
  const bedroom = pickLargestRoom(plan.rooms, "bedroom");

  const specs: LeafSpec[] = [];
  if (livingRoom) {
    const anchor = leafAnchorForRoom(livingRoom, "living");
    const sample = nearestSample(samples, anchor);
    specs.push({
      id: `leaf-${livingRoom.id}`,
      anchor,
      rotationDeg: leafRotationDeg(sample),
      speedMps: sample?.speedMps ?? 0,
    });
  }
  if (bedroom) {
    const anchor = leafAnchorForRoom(bedroom, "bedroom");
    const sample = nearestSample(samples, anchor);
    specs.push({
      id: `leaf-${bedroom.id}`,
      anchor,
      rotationDeg: leafRotationDeg(sample),
      speedMps: sample?.speedMps ?? 0,
    });
  }
  return specs;
}

function buildKitchenShadow(plan: PlanGeometry, samples: VelocitySample[]): KitchenShadowSpec | null {
  const kitchen = plan.rooms.find((room) => room.kind === "kitchen");
  if (!kitchen) return null;

  const anchor = {
    x: round(kitchen.x + kitchen.width / 2),
    y: round(kitchen.y + kitchen.height / 2),
  };
  const sample = nearestSample(samples, anchor);
  const speedMps = sample?.speedMps ?? 0;
  const intensity = clamp01(speedMps / SWAY_SATURATION_MPS);
  /**
   * Frame index discretises the velocity magnitude into 8 buckets. Each bucket
   * corresponds to a different pre-baked shadow texture; the intent is that a
   * still kitchen reads as soft, while a brisk cross-breeze through the kitchen
   * window casts a livelier perforated pattern.
   */
  const frameIndex = Math.min(SHADOW_FRAME_COUNT - 1, Math.floor(intensity * SHADOW_FRAME_COUNT));
  const blendOpacity = round01(0.18 + 0.42 * intensity);
  return {
    anchor,
    bounds: { x: kitchen.x, y: kitchen.y, width: kitchen.width, height: kitchen.height },
    frameIndex,
    blendOpacity,
    speedMps,
  };
}

function openingMidpoint(opening: OpeningGeometry): { x: number; y: number } {
  return {
    x: round((opening.start.x + opening.end.x) / 2),
    y: round((opening.start.y + opening.end.y) / 2),
  };
}

function openingSpan(opening: OpeningGeometry): number {
  return round(Math.hypot(opening.end.x - opening.start.x, opening.end.y - opening.start.y));
}

function openingOrientation(opening: OpeningGeometry): "horizontal" | "vertical" {
  const dx = Math.abs(opening.end.x - opening.start.x);
  const dy = Math.abs(opening.end.y - opening.start.y);
  return dx >= dy ? "horizontal" : "vertical";
}

function curtainSwayDeg(orientation: "horizontal" | "vertical", sample: VelocitySample | null): number {
  if (!sample) return 0;
  // Across-opening flow is normal to the window's long axis.
  const driver = orientation === "horizontal" ? sample.vy : sample.vx;
  const speed = Math.max(Math.abs(driver), 1e-6);
  const intensity = clamp01(speed / SWAY_SATURATION_MPS);
  return round(Math.sign(driver) * intensity * MAX_SWAY_DEG);
}

function leafAnchorForRoom(room: RoomGeometry, kind: "living" | "bedroom"): { x: number; y: number } {
  // Anchor in the corner closest to the room's interior so the leaf reads as a
  // potted plant rather than dead-center furniture. Living: window-facing corner
  // (top-left). Bedroom: opposite corner (bottom-right) to read as desk plant.
  const inset = 0.4;
  if (kind === "living") {
    return { x: round(room.x + inset), y: round(room.y + inset) };
  }
  return {
    x: round(room.x + room.width - inset),
    y: round(room.y + room.height - inset),
  };
}

function leafRotationDeg(sample: VelocitySample | null): number {
  if (!sample) return 0;
  const magnitude = Math.hypot(sample.vx, sample.vy);
  if (magnitude < 1e-6) return 0;
  /**
   * Leaf rotates toward the flow direction. We invert so the leaf "leans away"
   * — a leaf in real wind tilts away from the source, not toward it.
   */
  const angleDeg = (Math.atan2(sample.vy, sample.vx) * 180) / Math.PI;
  const intensity = clamp01(magnitude / SWAY_SATURATION_MPS);
  return round(angleDeg * intensity);
}

function pickLargestRoom(rooms: RoomGeometry[], kind: RoomGeometry["kind"]): RoomGeometry | null {
  const matches = rooms
    .filter((room) => room.kind === kind)
    .sort((a, b) => b.width * b.height - a.width * a.height || a.id.localeCompare(b.id));
  return matches[0] ?? null;
}

function nearestSample(samples: VelocitySample[], target: { x: number; y: number }): VelocitySample | null {
  if (samples.length === 0) return null;
  let best = samples[0];
  let bestDist = Math.hypot(best.x - target.x, best.y - target.y);
  for (let index = 1; index < samples.length; index += 1) {
    const candidate = samples[index];
    const dist = Math.hypot(candidate.x - target.x, candidate.y - target.y);
    if (dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  return best;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round01(value: number): number {
  return Math.round(value * 100) / 100;
}
