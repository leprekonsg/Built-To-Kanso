import type { PlanGeometry, TemplateId } from "@/server/geometry/types";
import type { TokenPlacement } from "@/server/rules/tokens";
import { isTokenPlacement } from "@/server/rules/tokens";
import { WEATHER_TRIALS, withPlanCondition } from "@/server/simulation/fieldBuilders";
import type { Tier4SimulationField, WeatherTrialConditionId } from "@/server/simulation/types";

export const SCENARIO_SCHEMA_VERSION = 1 as const;
export const LIVE_STUDIO_ANALYSIS_VERSION = "live-studio-v1" as const;

export interface ScenarioInput {
  schemaVersion: typeof SCENARIO_SCHEMA_VERSION;
  scenarioId: string;
  inputHash: string;
  geometry: {
    templateId: TemplateId;
    schemaVersion: number;
    contentHash: string;
    releaseEligible: boolean;
  };
  orientation: {
    planRotationDeg: number | null;
    mirrored: boolean | null;
  };
  openings: Array<{
    id: string;
    state: "open" | "closed" | "fixed";
    openingFraction: number;
    evidence: "assumed" | "observed";
  }>;
  placements: TokenPlacement[];
  household: {
    operatingScenario: string | null;
    supported: false;
  };
  conditions: {
    weatherCondition: WeatherTrialConditionId;
    windFromDeg: number | null;
    ambientWindMps: number;
    evidence: "assumed" | "observed";
  };
  analysis: {
    capability: "illustrative_airflow";
    version: typeof LIVE_STUDIO_ANALYSIS_VERSION;
    missingInputs: string[];
  };
}

export interface BuildScenarioInput {
  plan: PlanGeometry;
  geometryContentHash: string;
  geometryReleaseEligible: boolean;
  planRotationDeg: number | null;
  mirrored: boolean | null;
  placements: ReadonlyArray<TokenPlacement>;
  operatingScenario?: string | null;
  weatherCondition: WeatherTrialConditionId;
  windFromDeg: number | null;
  ambientWindMps: number;
  conditionsEvidence?: "assumed" | "observed";
}

export interface ScenarioBoundSimulationResult {
  scenarioId: string;
  inputHash: string;
  method: {
    id: "d2q9_lbm" | "prebaked_lookup";
    version: string;
    evidence: "prototype_visualisation";
  };
  field: Tier4SimulationField;
}

export type CoordinatedSimulationResult = ScenarioBoundSimulationResult & {
  precedence: "illustrative_fallback" | "calculated";
};

export function buildScenario(input: BuildScenarioInput): ScenarioInput {
  const core = {
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    geometry: {
      templateId: input.plan.templateId,
      schemaVersion: input.plan.schemaVersion,
      contentHash: input.geometryContentHash,
      releaseEligible: input.geometryReleaseEligible,
    },
    orientation: {
      planRotationDeg: normaliseDegrees(input.planRotationDeg),
      mirrored: input.mirrored,
    },
    openings: input.plan.openings.map((opening) => ({
      id: opening.id,
      state: opening.operable ? ("open" as const) : ("fixed" as const),
      openingFraction: opening.operable ? 1 : 0,
      evidence: "assumed" as const,
    })),
    placements: input.placements.map((placement) => ({
      tokenId: placement.tokenId,
      point: { x: placement.point.x, y: placement.point.y },
    })),
    household: {
      operatingScenario: input.operatingScenario ?? null,
      supported: false as const,
    },
    conditions: {
      weatherCondition: input.weatherCondition,
      windFromDeg: normaliseDegrees(input.windFromDeg),
      ambientWindMps: input.ambientWindMps,
      evidence: input.conditionsEvidence ?? ("assumed" as const),
    },
    analysis: {
      capability: "illustrative_airflow" as const,
      version: LIVE_STUDIO_ANALYSIS_VERSION,
      missingInputs: ["dimensioned_furniture", "household_requirements"],
    },
  };
  const inputHash = hashCanonical(core);
  return { ...core, scenarioId: `scenario-${inputHash}`, inputHash };
}

export function hasValidScenarioIdentity(scenario: ScenarioInput): boolean {
  const { scenarioId: _scenarioId, inputHash: _inputHash, ...core } = scenario;
  const expected = hashCanonical(core);
  return scenario.inputHash === expected && scenario.scenarioId === `scenario-${expected}`;
}

export function validateIllustrativeAirflowScenario(
  scenario: ScenarioInput,
  plan: PlanGeometry,
  expectedGeometryHash: string,
): string | null {
  if (!hasValidScenarioIdentity(scenario)) return "scenario identity does not match its inputs.";
  if (scenario.geometry.templateId !== plan.templateId) return "scenario geometry does not match the requested template.";
  if (scenario.geometry.contentHash !== expectedGeometryHash) return "scenario geometry hash is stale.";
  if (!scenario.geometry.releaseEligible) return "scenario geometry has not passed the release gate.";
  if (scenario.orientation.planRotationDeg !== null || scenario.orientation.mirrored !== null) {
    return "illustrative airflow currently supports plan-relative orientation only; rotation and mirroring must be unknown.";
  }
  const supportedCondition = withPlanCondition(
    WEATHER_TRIALS[scenario.conditions.weatherCondition],
    plan.westSunFacadeDeg,
  );
  if (
    scenario.conditions.windFromDeg !== supportedCondition.compassDeg ||
    scenario.conditions.ambientWindMps !== supportedCondition.ambientWindMps ||
    scenario.conditions.evidence !== "assumed"
  ) {
    return "weather direction and speed must match the selected illustrative condition.";
  }
  const expectedOpenings = plan.openings.map((opening) => ({
    id: opening.id,
    state: opening.operable ? ("open" as const) : ("fixed" as const),
    openingFraction: opening.operable ? 1 : 0,
    evidence: "assumed" as const,
  }));
  if (canonicalStringify(scenario.openings) !== canonicalStringify(expectedOpenings)) {
    return "opening operating states are not supported by this airflow method.";
  }
  return null;
}

export function parseIllustrativeAirflowScenario(
  value: unknown,
  plan: PlanGeometry,
  expectedGeometryHash: string,
): ScenarioInput | string {
  if (!isRecord(value)) return "scenario must be an object.";
  if (
    value.schemaVersion !== SCENARIO_SCHEMA_VERSION ||
    typeof value.scenarioId !== "string" ||
    typeof value.inputHash !== "string" ||
    !isRecord(value.geometry) ||
    value.geometry.templateId !== plan.templateId ||
    value.geometry.schemaVersion !== plan.schemaVersion ||
    typeof value.geometry.contentHash !== "string" ||
    typeof value.geometry.releaseEligible !== "boolean" ||
    !isRecord(value.orientation) ||
    !Array.isArray(value.openings) ||
    !Array.isArray(value.placements) ||
    !value.placements.every(isTokenPlacement) ||
    !isRecord(value.household) ||
    (value.household.operatingScenario !== null && typeof value.household.operatingScenario !== "string") ||
    value.household.supported !== false ||
    !isRecord(value.conditions) ||
    !(typeof value.conditions.weatherCondition === "string" && Object.hasOwn(WEATHER_TRIALS, value.conditions.weatherCondition)) ||
    (value.conditions.windFromDeg !== null && typeof value.conditions.windFromDeg !== "number") ||
    typeof value.conditions.ambientWindMps !== "number" ||
    !isRecord(value.analysis) ||
    value.analysis.capability !== "illustrative_airflow" ||
    value.analysis.version !== LIVE_STUDIO_ANALYSIS_VERSION ||
    !Array.isArray(value.analysis.missingInputs) ||
    !value.analysis.missingInputs.every((item) => typeof item === "string")
  ) {
    return "scenario does not match the illustrative airflow contract.";
  }
  const scenario = value as unknown as ScenarioInput;
  const issue = validateIllustrativeAirflowScenario(scenario, plan, expectedGeometryHash);
  return issue ?? scenario;
}

export function chooseSimulationResult(
  activeScenarioId: string,
  current: CoordinatedSimulationResult | null,
  candidate: CoordinatedSimulationResult,
): CoordinatedSimulationResult | null {
  if (candidate.scenarioId !== activeScenarioId) return current?.scenarioId === activeScenarioId ? current : null;
  if (!current || current.scenarioId !== activeScenarioId) return candidate;
  if (current.precedence === "calculated" && candidate.precedence === "illustrative_fallback") return current;
  return candidate;
}

export function createSimulationResultCoordinator(
  activeScenarioId: string,
  commit: (result: CoordinatedSimulationResult) => void,
) {
  let closed = false;
  let current: CoordinatedSimulationResult | null = null;
  return {
    offer(candidate: CoordinatedSimulationResult): boolean {
      if (closed || candidate.scenarioId !== activeScenarioId) return false;
      const selected = chooseSimulationResult(activeScenarioId, current, candidate);
      if (!selected || selected === current) return false;
      current = selected;
      commit(selected);
      return true;
    },
    close() {
      closed = true;
    },
  };
}

export function bindSimulationResult(
  scenario: ScenarioInput,
  field: Tier4SimulationField,
): ScenarioBoundSimulationResult {
  const calculated = field.simulationSource.kind === "tier1_live";
  return {
    scenarioId: scenario.scenarioId,
    inputHash: scenario.inputHash,
    method: {
      id: calculated ? "d2q9_lbm" : "prebaked_lookup",
      version: calculated ? "browser-tier1-v1" : field.cacheMeta?.matrix.version ?? "tier4-v1",
      evidence: "prototype_visualisation",
    },
    field,
  };
}

function normaliseDegrees(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return ((value % 360) + 360) % 360;
}

function hashCanonical(value: unknown): string {
  const text = canonicalStringify(value);
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
