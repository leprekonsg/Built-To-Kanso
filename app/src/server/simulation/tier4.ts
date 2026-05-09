import type { TemplateId } from "@/server/geometry/types";
import { getPlanGeometry, isTemplateId } from "@/server/geometry/registry";
import { getLbmComputeCapability, runTier1IfAvailable } from "@/server/lbm/gpuSolver";
import { runLbmCpu } from "@/server/lbm/solver";
import { extractStreamlinePoints } from "@/server/lbm/streamlines";
import type { RawVelocityField, VelocityField } from "@/server/lbm/types";
import { allowedTokenPlacements, isTokenPlacement, type TokenPlacement } from "@/server/rules/tokens";
import {
  DEFAULT_TIER4_WEATHER_CONDITION,
  lookupTier4Prebake,
  TIER4_WEATHER_CONDITIONS,
} from "./prebaked";
import type {
  SimulationParticle,
  SimulationSourceMetadata,
  SimulationStreamline,
  Tier4SimulationField,
  VelocitySample,
  WeatherTrialCondition,
  WeatherTrialConditionId,
} from "./types";

export interface SimulationRequestInput {
  templateId?: unknown;
  tokenPlacements?: unknown;
  candidatePositions?: unknown;
  weatherCondition?: unknown;
  condition?: unknown;
}

export interface ValidSimulationRequest {
  templateId: TemplateId;
  tokenPlacements: TokenPlacement[];
  candidatePositions: TokenPlacement[];
  condition: WeatherTrialConditionId;
}

const DEFAULT_CONDITION: WeatherTrialConditionId = DEFAULT_TIER4_WEATHER_CONDITION;
const CPU_GRID = 64;
const CPU_ITERATIONS = 140;
/** Tier 1 GPU solve iteration count. The 256x256 D2Q9 BGK pipeline reaches a
 *  reasonable steady state for streamline extraction at this depth; the solver
 *  is incremental, callers can call step() more times before readback. */
const TIER1_ITERATIONS = 600;
const STREAMLINE_COUNT = 6;
const VELOCITY_SAMPLE_COUNT = 6;

const MATERIAL_DEFAULTS = {
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

const WEATHER_TRIALS: Record<WeatherTrialConditionId, WeatherTrialCondition> = {
  baseline_monsoon: {
    id: "baseline_monsoon",
    label: "Baseline monsoon",
    compassDeg: 270,
    ambientWindMps: 1.5,
  },
  ne_monsoon: {
    id: "ne_monsoon",
    label: "NE monsoon",
    compassDeg: 45,
    ambientWindMps: 2.4,
  },
  sw_monsoon: {
    id: "sw_monsoon",
    label: "SW monsoon",
    compassDeg: 225,
    ambientWindMps: 2.1,
  },
  west_sun_still_air: {
    id: "west_sun_still_air",
    label: "West-sun still air",
    compassDeg: 270,
    ambientWindMps: 0.35,
  },
  west_sun_1720: {
    id: "west_sun_1720",
    label: "West Sun 17:20",
    compassDeg: 270,
    ambientWindMps: 0.65,
  },
  highway_night: {
    id: "highway_night",
    label: "Highway Night",
    compassDeg: 210,
    ambientWindMps: 1.3,
  },
  ne_monsoon_wind: {
    id: "ne_monsoon_wind",
    label: "NE Monsoon Wind",
    compassDeg: 45,
    ambientWindMps: 1.9,
  },
};

export function validateSimulationRequest(input: SimulationRequestInput): ValidSimulationRequest | string {
  if (typeof input.templateId !== "string" || !isTemplateId(input.templateId)) {
    return "templateId must be one of: tampines-greenweave, tengah-5room, resale-exec-1990s.";
  }

  const condition = parseCondition(input.condition, input.weatherCondition);
  if (!condition.ok) return condition.error;

  if (input.tokenPlacements === undefined) {
    return { templateId: input.templateId, tokenPlacements: [], candidatePositions: [], condition: condition.value };
  }

  if (!Array.isArray(input.tokenPlacements)) {
    return "tokenPlacements must be an array of { tokenId, point: { x, y } }.";
  }

  for (const placement of input.tokenPlacements) {
    if (!isTokenPlacementLike(placement)) {
      return "Each token placement must include tokenId and numeric point { x, y } in plan meters.";
    }
  }

  if (input.candidatePositions !== undefined && !Array.isArray(input.candidatePositions)) {
    return "candidatePositions must be an array of { tokenId, point: { x, y } }.";
  }

  if (input.candidatePositions?.some((candidate) => !isTokenPlacementLike(candidate))) {
    return "Each candidate position must include tokenId and numeric point { x, y } in plan meters.";
  }

  return {
    templateId: input.templateId,
    tokenPlacements: input.tokenPlacements,
    candidatePositions: input.candidatePositions ?? [],
    condition: condition.value,
  };
}

export function buildTier4Simulation(input: ValidSimulationRequest | string): Tier4SimulationField {
  if (typeof input === "string") {
    throw new Error(input);
  }

  const plan = getPlanGeometry(input.templateId);
  const condition = withPlanCondition(WEATHER_TRIALS[input.condition], plan.westSunFacadeDeg);
  const validPlacements = allowedTokenPlacements(plan, input.tokenPlacements);
  const prebaked = lookupTier4Prebake({
    templateId: input.templateId,
    tokenPlacements: validPlacements,
    candidatePositions: input.candidatePositions,
    weatherCondition: condition.id,
  });
  const sourceMeta = simulationSourceMetadata("cpu_reference", "prebaked", { width: 0, height: 0, iterations: 0 });

  return {
    templateId: input.templateId,
    condition,
    resolution: {
      width: plan.bounds.width,
      height: plan.bounds.height,
      units: "meters",
      sampleStepM: 1.2,
    },
    materialPreset: "monsoon_atelier_default",
    materialDefaults: MATERIAL_DEFAULTS,
    streamlines: prebaked.field.streamlines.map((line) => ({
      ...line,
      points: line.points.map((point) => ({ ...point })),
    })),
    particles: prebaked.field.particles.map((particle) => ({ ...particle })),
    velocitySamples: prebaked.field.velocitySamples.map((sample) => ({ ...sample })),
    source: sourceMeta,
    simulationSource: sourceMeta,
    cacheMeta: prebaked.meta,
    tier: "prototype_visualisation",
  };
}

/**
 * Tier 1 entry point: attempt a live WebGPU LBM solve, fall back silently to
 * Tier 4 if WebGPU is unavailable or any step in the pipeline fails. Brief
 * Section 11: "Tier 4 lookup runs silently; user never sees the difference."
 *
 * Server-side this always falls through to Tier 4 (no `navigator.gpu` in
 * Node). Browser callers get a 256x256 live velocity field deterministically
 * decoded into streamlines via `extractStreamlinePoints`.
 */
export async function buildSimulation(
  input: ValidSimulationRequest | string,
): Promise<Tier4SimulationField> {
  if (typeof input === "string") {
    throw new Error(input);
  }

  const plan = getPlanGeometry(input.templateId);
  const condition = withPlanCondition(WEATHER_TRIALS[input.condition], plan.westSunFacadeDeg);
  const placements = allowedTokenPlacements(plan, input.tokenPlacements);

  const tier1 = await runTier1IfAvailable({
    templateId: input.templateId,
    compassDeg: condition.compassDeg,
    ambientWindMps: condition.ambientWindMps,
    iterations: TIER1_ITERATIONS,
  });

  if (tier1) {
    const raw = tier1 as unknown as RawVelocityField;
    const source = simulationSourceMetadata(
      "tier1_live",
      "webgpu",
      { width: raw.width, height: raw.height, iterations: TIER1_ITERATIONS },
    );
    return {
      templateId: input.templateId,
      condition,
      resolution: {
        width: plan.bounds.width,
        height: plan.bounds.height,
        units: "meters",
        sampleStepM: 1.2,
      },
      materialPreset: "monsoon_atelier_default",
      materialDefaults: MATERIAL_DEFAULTS,
      streamlines: buildStreamlines(tier1, plan, condition, placements),
      particles: buildParticles(tier1, plan, condition, placements),
      velocitySamples: sampleVelocityField(tier1, plan),
      source,
      simulationSource: source,
      tier: "prototype_visualisation",
    };
  }

  const cpu = buildCpuReferenceField(plan, condition, placements);
  return {
    templateId: input.templateId,
    condition,
    resolution: {
      width: plan.bounds.width,
      height: plan.bounds.height,
      units: "meters",
      sampleStepM: 1.2,
    },
    materialPreset: "monsoon_atelier_default",
    materialDefaults: MATERIAL_DEFAULTS,
    streamlines: cpu.streamlines,
    particles: cpu.particles,
    velocitySamples: cpu.velocitySamples,
    source: cpu.source,
    simulationSource: cpu.source,
    tier: "prototype_visualisation",
  };
}

function isTokenPlacementLike(value: unknown): value is TokenPlacement {
  return isTokenPlacement(value);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function shaftFactor(placements: TokenPlacement[]): number {
  return placements.some((placement) => placement.tokenId === "shaft_buffer") ? 0.72 : 1;
}

function simulationSourceMetadata(
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

function parseCondition(
  value: unknown,
  weatherCondition: unknown,
): { ok: true; value: WeatherTrialConditionId } | { ok: false; error: string } {
  if (value === undefined && weatherCondition === undefined) return { ok: true, value: DEFAULT_CONDITION };
  if (value === undefined) {
    if (typeof weatherCondition === "string" && isWeatherTrialConditionId(weatherCondition)) {
      return { ok: true, value: weatherCondition };
    }
    return { ok: false, error: WEATHER_CONDITION_ERROR };
  }

  if (typeof value !== "string" || !isWeatherTrialConditionId(value)) {
    return { ok: false, error: WEATHER_CONDITION_ERROR };
  }
  return { ok: true, value };
}

const WEATHER_CONDITION_ERROR =
  "weatherCondition must be one of: baseline_monsoon, ne_monsoon, sw_monsoon, west_sun_still_air, west_sun_1720, highway_night, ne_monsoon_wind.";

function isWeatherTrialConditionId(value: string): value is WeatherTrialConditionId {
  return value in TIER4_WEATHER_CONDITIONS;
}

function withPlanCondition(condition: WeatherTrialCondition, westSunFacadeDeg: number): WeatherTrialCondition {
  if (condition.id !== "west_sun_still_air" && condition.id !== "west_sun_1720") return condition;
  return { ...condition, compassDeg: westSunFacadeDeg };
}

function buildCpuReferenceField(
  plan: ReturnType<typeof getPlanGeometry>,
  condition: WeatherTrialCondition,
  placements: TokenPlacement[],
): {
  streamlines: SimulationStreamline[];
  particles: SimulationParticle[];
  velocitySamples: VelocitySample[];
  source: SimulationSourceMetadata;
} {
  const capability = getLbmComputeCapability();

  try {
    const field = runLbmCpu(plan, condition.compassDeg, condition.ambientWindMps, CPU_ITERATIONS, CPU_GRID);
    const raw = field as unknown as RawVelocityField;
    return {
      streamlines: buildStreamlines(field, plan, condition, placements),
      particles: buildParticles(field, plan, condition, placements),
      velocitySamples: sampleVelocityField(field, plan),
      source: simulationSourceMetadata("cpu_reference", "cpu", { width: raw.width, height: raw.height, iterations: CPU_ITERATIONS }),
    };
  } catch (error) {
    const fallback = buildPrebakedFallbackField(plan, condition);
    return {
      streamlines: fallback.streamlines,
      particles: fallback.particles,
      velocitySamples: fallback.velocitySamples,
      source: simulationSourceMetadata(
        "prebaked_fallback",
        "prebaked",
        { width: 0, height: 0, iterations: 0 },
        error instanceof Error ? error.message : "CPU reference failed.",
      ),
    };
  }
}

function buildStreamlines(
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

function buildParticles(
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

function sampleVelocityField(field: VelocityField, plan: ReturnType<typeof getPlanGeometry>): VelocitySample[] {
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

function buildPrebakedFallbackField(
  plan: ReturnType<typeof getPlanGeometry>,
  condition: WeatherTrialCondition,
): {
  streamlines: SimulationStreamline[];
  particles: SimulationParticle[];
  velocitySamples: VelocitySample[];
} {
  const direction = compassVector(condition.compassDeg);
  const speed = round(condition.ambientWindMps * 0.08);
  const centerY = plan.bounds.y + plan.bounds.height / 2;
  const startX = direction.x < 0 ? plan.bounds.x + plan.bounds.width * 0.86 : plan.bounds.x + plan.bounds.width * 0.14;

  const streamlines: SimulationStreamline[] = [0, 1, 2].map((index) => {
    const y = centerY + (index - 1) * plan.bounds.height * 0.16;
    return {
      id: `${condition.id}-fallback-${index + 1}`,
      material: index === 2 ? "sumi_ink" : "silk_ribbon",
      speedMps: speed,
      points: [
        { x: roundPoint(startX), y: roundPoint(y) },
        { x: roundPoint(startX + direction.x * plan.bounds.width * 0.24), y: roundPoint(y + direction.y * plan.bounds.height * 0.18) },
        { x: roundPoint(startX + direction.x * plan.bounds.width * 0.48), y: roundPoint(y + direction.y * plan.bounds.height * 0.32) },
      ],
    };
  });
  const velocitySamples = streamlines.map((line) => ({
    x: line.points[1].x,
    y: line.points[1].y,
    vx: round(direction.x * speed),
    vy: round(direction.y * speed),
    speedMps: speed,
  }));
  const particles: SimulationParticle[] = velocitySamples.slice(0, 3).map((sample, index) => ({
    id: `p${index + 1}`,
    kind: "clean_air" as const,
    material: "sunlit_dust" as const,
    x: sample.x,
    y: sample.y,
    delayMs: index * 420,
    speedMps: sample.speedMps,
  }));
  particles.push(...buildPipeshaftJetParticles(plan, condition, 1260, 1));

  return { streamlines, particles, velocitySamples };
}

function buildPipeshaftJetParticles(
  plan: ReturnType<typeof getPlanGeometry>,
  condition: WeatherTrialCondition,
  startDelayMs: number,
  attenuation: number,
): SimulationParticle[] {
  const rad = (plan.pipeshaft.openingDirectionDeg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const [minJet, maxJet] = plan.pipeshaft.jetVelocityMps;
  const baseSpeed = round(((minJet + maxJet) / 2) * attenuation);
  return [0, 1, 2].map((index) => ({
    id: `pipeshaft-jet-${index + 1}`,
    kind: "pipeshaft_drift" as const,
    material: "hdb_concrete_dust" as const,
    x: roundPoint(plan.pipeshaft.openingPoint.x + dx * index * 0.18),
    y: roundPoint(plan.pipeshaft.openingPoint.y + dy * index * 0.18),
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

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundPoint(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function compassVector(compassDeg: number) {
  const rad = (compassDeg * Math.PI) / 180;
  return {
    x: -Math.sin(rad),
    y: -Math.cos(rad),
  };
}
