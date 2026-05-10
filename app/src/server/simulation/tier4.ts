import type { TemplateId } from "@/server/geometry/types";
import { getPlanGeometry, isTemplateId } from "@/server/geometry/registry";
import { runTier1IfAvailable } from "@/server/lbm/gpuSolver";
import { allowedTokenPlacements, isTokenPlacement, type TokenPlacement } from "@/server/rules/tokens";
import {
  composeTier1Field,
  MATERIAL_DEFAULTS,
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
  Tier4SimulationField,
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
  const sourceMeta = simulationSourceMetadata(
    "prebaked_fallback",
    "prebaked",
    { width: 0, height: 0, iterations: 0 },
    "Tier 4 deterministic lookup is the no-cloud demo fallback.",
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
 * Tier 1 entry point: attempt a live WebGPU LBM solve, then fall through to the
 * explicit Tier 4 prebaked lookup when WebGPU is unavailable or any step fails.
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

  return buildTier4Simulation({
    templateId: input.templateId,
    tokenPlacements: placements,
    candidatePositions: input.candidatePositions,
    condition: input.condition,
  });
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
