/**
 * Pure field-construction helpers shared by the server-side `buildSimulation`
 * (tier4.ts) and the client-side Tier 1 upgrade path (LiveStudio).
 *
 * No imports from `./prebaked` — kept out so this module can be bundled into
 * the client without dragging the pre-baked Tier 4 lookup data along.
 */

import { getPlanGeometry } from "@/server/geometry/registry";
import { getLbmComputeCapability } from "@/server/lbm/gpuSolver";
import { extractStreamlinePoints } from "@/server/lbm/streamlines";
import type { RawVelocityField, VelocityField } from "@/server/lbm/types";
import { allowedTokenPlacements, type TokenPlacement } from "@/server/rules/tokens";
import type {
  SimulationParticle,
  SimulationSourceMetadata,
  SimulationStreamline,
  Tier4SimulationField,
  VelocitySample,
  WeatherTrialCondition,
  WeatherTrialConditionId,
} from "./types";

const STREAMLINE_COUNT = 6;
const VELOCITY_SAMPLE_COUNT = 6;

export const MATERIAL_DEFAULTS = {
  streamlines: {
    sumiInk: "#111111",
    silkRibbon: "#E5C37A",
  },
  particles: {
    cleanAir: "#D8A24A",
    pipeshaft: "#A79F93",
  },
  visibility: {
    minOpacity: 0.28,
    maxOpacity: 0.94,
  },
} as const;

export const WEATHER_TRIALS: Record<WeatherTrialConditionId, WeatherTrialCondition> = {
  baseline_monsoon: { id: "baseline_monsoon", label: "Baseline monsoon", compassDeg: 270, ambientWindMps: 1.5 },
  ne_monsoon: { id: "ne_monsoon", label: "NE monsoon", compassDeg: 45, ambientWindMps: 2.4 },
  sw_monsoon: { id: "sw_monsoon", label: "SW monsoon", compassDeg: 225, ambientWindMps: 2.1 },
  west_sun_still_air: { id: "west_sun_still_air", label: "West-sun still air", compassDeg: 270, ambientWindMps: 0.35 },
  west_sun_1720: { id: "west_sun_1720", label: "West Sun 17:20", compassDeg: 270, ambientWindMps: 0.65 },
  highway_night: { id: "highway_night", label: "Highway Night", compassDeg: 210, ambientWindMps: 1.3 },
  ne_monsoon_wind: { id: "ne_monsoon_wind", label: "NE Monsoon Wind", compassDeg: 45, ambientWindMps: 1.9 },
};

export function withPlanCondition(condition: WeatherTrialCondition, westSunFacadeDeg: number): WeatherTrialCondition {
  if (condition.id !== "west_sun_still_air" && condition.id !== "west_sun_1720") return condition;
  return { ...condition, compassDeg: westSunFacadeDeg };
}

export function simulationSourceMetadata(
  kind: SimulationSourceMetadata["kind"],
  adapter: SimulationSourceMetadata["adapter"],
  grid: SimulationSourceMetadata["grid"],
  fallbackReason?: string,
): SimulationSourceMetadata {
  const capability = getLbmComputeCapability();
  return {
    kind,
    engine: "d2q9_lbm",
    adapter,
    grid,
    webGpu: {
      available: capability.webGpuAvailable,
      implemented: capability.webGpuImplemented,
      reason: capability.reason,
    },
    ...(fallbackReason ? { fallbackReason } : {}),
  };
}

export function buildStreamlines(
  field: VelocityField,
  plan: ReturnType<typeof getPlanGeometry>,
  condition: WeatherTrialCondition,
  placements: TokenPlacement[],
): SimulationStreamline[] {
  const lines = extractStreamlinePoints(field, plan, {
    count: STREAMLINE_COUNT,
    compassDeg: condition.compassDeg,
  });

  return lines.map((points, index) => {
    const speeds = points.map((point) => sampleVelocityAt(field, plan, point.x, point.y).speedMps);
    const isPipeshaft = index === lines.length - 1;
    const speedMps = isPipeshaft
      ? round(Math.max(round(condition.ambientWindMps * 0.08), round(average(speeds))) * shaftFactor(placements))
      : round(average(speeds));
    return {
      id: isPipeshaft ? "pipeshaft-drift" : `${condition.id}-streamline-${index + 1}`,
      material: isPipeshaft ? "sumi_ink" : "silk_ribbon",
      speedMps,
      points: points.map((point) => ({ x: roundPoint(point.x), y: roundPoint(point.y) })),
    };
  });
}

export function buildParticles(
  field: VelocityField,
  plan: ReturnType<typeof getPlanGeometry>,
  condition: WeatherTrialCondition,
  placements: TokenPlacement[],
): SimulationParticle[] {
  const samples = sampleVelocityField(field, plan);
  const particles: SimulationParticle[] = samples.slice(0, 3).map((sample, index) => ({
    id: `p${index + 1}`,
    kind: "clean_air" as const,
    material: "sunlit_dust" as const,
    x: sample.x,
    y: sample.y,
    delayMs: index * 420,
    speedMps: sample.speedMps,
  }));

  particles.push(...buildPipeshaftJetParticles(plan, condition, 1260, shaftFactor(placements)));

  return particles;
}

export function sampleVelocityField(field: VelocityField, plan: ReturnType<typeof getPlanGeometry>): VelocitySample[] {
  const raw = field as unknown as RawVelocityField;
  const stride = Math.max(1, Math.floor(Math.min(raw.width, raw.height) / 8));
  const candidates: Array<VelocitySample & { speedLu: number; ix: number; iy: number }> = [];

  for (let y = stride; y < raw.height - stride; y += stride) {
    for (let x = stride; x < raw.width - stride; x += stride) {
      const vx = raw.data[(y * raw.width + x) * 2];
      const vy = raw.data[(y * raw.width + x) * 2 + 1];
      const speedLu = Math.hypot(vx, vy);
      if (speedLu < 1e-5) continue;
      const point = gridToPlan(plan.bounds, raw.width, raw.height, x, y);
      candidates.push({
        x: roundPoint(point.x),
        y: roundPoint(point.y),
        vx: round(vx * 10),
        vy: round(vy * 10),
        speedMps: round(speedLu * 10),
        speedLu,
        ix: x,
        iy: y,
      });
    }
  }

  return candidates
    .sort((a, b) => b.speedLu - a.speedLu || a.iy - b.iy || a.ix - b.ix)
    .slice(0, VELOCITY_SAMPLE_COUNT)
    .map(({ speedLu: _speedLu, ix: _ix, iy: _iy, ...sample }) => sample);
}

export function buildPipeshaftJetParticles(
  plan: ReturnType<typeof getPlanGeometry>,
  condition: WeatherTrialCondition,
  startDelayMs: number,
  attenuation: number,
): SimulationParticle[] {
  if (!plan.pipeshaft) return [];
  const pipeshaft = plan.pipeshaft;
  const rad = (pipeshaft.openingDirectionDeg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const [minJet, maxJet] = pipeshaft.jetVelocityMps;
  const baseSpeed = round(((minJet + maxJet) / 2) * attenuation);
  return [0, 1, 2].map((index) => ({
    id: `pipeshaft-jet-${index + 1}`,
    kind: "pipeshaft_drift" as const,
    material: "hdb_concrete_dust" as const,
    x: roundPoint(pipeshaft.openingPoint.x + dx * index * 0.18),
    y: roundPoint(pipeshaft.openingPoint.y + dy * index * 0.18),
    delayMs: startDelayMs + index * 280,
    speedMps: baseSpeed,
  }));
}

function sampleVelocityAt(
  field: VelocityField,
  plan: ReturnType<typeof getPlanGeometry>,
  px: number,
  py: number,
): VelocitySample {
  const raw = field as unknown as RawVelocityField;
  const x = Math.min(raw.width - 1, Math.max(0, Math.floor(((px - plan.bounds.x) / plan.bounds.width) * raw.width)));
  const y = Math.min(raw.height - 1, Math.max(0, Math.floor(((py - plan.bounds.y) / plan.bounds.height) * raw.height)));
  const vx = raw.data[(y * raw.width + x) * 2];
  const vy = raw.data[(y * raw.width + x) * 2 + 1];
  return {
    x: roundPoint(px),
    y: roundPoint(py),
    vx: round(vx * 10),
    vy: round(vy * 10),
    speedMps: round(Math.hypot(vx, vy) * 10),
  };
}

function gridToPlan(bounds: ReturnType<typeof getPlanGeometry>["bounds"], width: number, height: number, x: number, y: number) {
  return {
    x: bounds.x + ((x + 0.5) / width) * bounds.width,
    y: bounds.y + ((y + 0.5) / height) * bounds.height,
  };
}

function shaftFactor(placements: TokenPlacement[]): number {
  return placements.some((placement) => placement.tokenId === "shaft_buffer") ? 0.72 : 1;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundPoint(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Compose a `Tier4SimulationField` from a Tier 1 GPU velocity field.
 *
 * Used by both the server (tier4.ts) on a successful Tier 1 dispatch, and by
 * the LiveStudio client hook when WebGPU is available in the browser. Pure:
 * given identical inputs, returns identical output.
 */
export function composeTier1Field(args: {
  templateId: ReturnType<typeof getPlanGeometry>["templateId"];
  field: VelocityField;
  condition: WeatherTrialCondition;
  tokenPlacements: TokenPlacement[];
  iterations: number;
}): Tier4SimulationField {
  const plan = getPlanGeometry(args.templateId);
  const condition = withPlanCondition(args.condition, plan.westSunFacadeDeg);
  const placements = allowedTokenPlacements(plan, args.tokenPlacements);
  const raw = args.field as unknown as RawVelocityField;
  const source = simulationSourceMetadata(
    "tier1_live",
    "webgpu",
    { width: raw.width, height: raw.height, iterations: args.iterations },
  );

  return {
    templateId: args.templateId,
    condition,
    resolution: {
      width: plan.bounds.width,
      height: plan.bounds.height,
      units: "meters",
      sampleStepM: 1.2,
    },
    materialPreset: "monsoon_atelier_default",
    materialDefaults: MATERIAL_DEFAULTS,
    streamlines: buildStreamlines(args.field, plan, condition, placements),
    particles: buildParticles(args.field, plan, condition, placements),
    velocitySamples: sampleVelocityField(args.field, plan),
    source,
    simulationSource: source,
    tier: "prototype_visualisation",
  };
}
