import type { TemplateId } from "@/server/geometry/types";
import { getPlanGeometry, isTemplateId } from "@/server/geometry/registry";
import { runTier1IfAvailable } from "@/server/lbm/gpuSolver";
import { runLbmCpu } from "@/server/lbm/solver";
import type { RawVelocityField } from "@/server/lbm/types";
import { allowedTokenPlacements, isTokenPlacement, type TokenPlacement } from "@/server/rules/tokens";
import {
  buildParticles,
  buildPipeshaftJetParticles,
  buildStreamlines,
  composeTier1Field,
  MATERIAL_DEFAULTS,
  sampleVelocityField,
  simulationSourceMetadata,
  WEATHER_TRIALS,
  withPlanCondition,
} from "./fieldBuilders";
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
export const TIER1_ITERATIONS = 600;

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
    return composeTier1Field({
      templateId: input.templateId,
      field: tier1,
      condition,
      tokenPlacements: placements,
      iterations: TIER1_ITERATIONS,
    });
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

function round(value: number): number {
  return Math.round(value * 100) / 100;
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
