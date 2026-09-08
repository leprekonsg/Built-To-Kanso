import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getPlanGeometry } from "@/server/geometry/registry";
import type { Tier4SimulationField } from "@/server/simulation/types";
import { buildScenario, chooseSimulationResult, createSimulationResultCoordinator, hasValidScenarioIdentity, parseIllustrativeAirflowScenario, type CoordinatedSimulationResult } from "./scenario";

function scenario(placementX = 1) {
  return buildScenario({
    plan: getPlanGeometry("tengah-5room"),
    geometryContentHash: "geometry-sha256",
    geometryReleaseEligible: true,
    planRotationDeg: null,
    mirrored: null,
    placements: [{ tokenId: "soft_screen", point: { x: placementX, y: 2 } }],
    operatingScenario: "just-moved-in",
    weatherCondition: "ne_monsoon",
    windFromDeg: 45,
    ambientWindMps: 2.4,
  });
}

function result(scenarioId: string, precedence: CoordinatedSimulationResult["precedence"]): CoordinatedSimulationResult {
  return {
    scenarioId,
    inputHash: scenarioId,
    precedence,
    method: { id: precedence === "calculated" ? "d2q9_lbm" : "prebaked_lookup", version: "test", evidence: "prototype_visualisation" },
    field: {} as Tier4SimulationField,
  };
}

describe("shared scenario identity", () => {
  it("keeps plan rotation distinct from wind-from direction and detects changes", () => {
    const first = buildScenario({
      plan: getPlanGeometry("tengah-5room"), geometryContentHash: "geometry-sha256", geometryReleaseEligible: true,
      planRotationDeg: 90, mirrored: false, placements: [], weatherCondition: "ne_monsoon", windFromDeg: 45, ambientWindMps: 2.4,
    });
    assert.equal(first.orientation.planRotationDeg, 90);
    assert.equal(first.conditions.windFromDeg, 45);
    assert.equal(hasValidScenarioIdentity(first), true);
    assert.notEqual(first.scenarioId, scenario(1.1).scenarioId);
  });

  it("records unsupported household and object inputs rather than inventing them", () => {
    const value = scenario();
    assert.equal(value.household.supported, false);
    assert.deepEqual(value.analysis.missingInputs, ["dimensioned_furniture", "household_requirements"]);
    assert.ok(value.openings.every((opening) => opening.evidence === "assumed"));
  });

  it("rejects valid-identity scenarios with unsupported orientation, weather, or opening states", () => {
    const plan = getPlanGeometry("tengah-5room");
    const rotated = buildScenario({
      plan, geometryContentHash: "geometry-sha256", geometryReleaseEligible: true,
      planRotationDeg: 90, mirrored: null, placements: [], weatherCondition: "ne_monsoon", windFromDeg: 45, ambientWindMps: 2.4,
    });
    assert.equal(hasValidScenarioIdentity(rotated), true);
    assert.equal(
      parseIllustrativeAirflowScenario(rotated, plan, "geometry-sha256"),
      "illustrative airflow currently supports plan-relative orientation only; rotation and mirroring must be unknown.",
    );

    const alteredWeather = buildScenario({
      plan, geometryContentHash: "geometry-sha256", geometryReleaseEligible: true,
      planRotationDeg: null, mirrored: null, placements: [], weatherCondition: "ne_monsoon", windFromDeg: 45, ambientWindMps: 99,
    });
    assert.equal(hasValidScenarioIdentity(alteredWeather), true);
    assert.equal(
      parseIllustrativeAirflowScenario(alteredWeather, plan, "geometry-sha256"),
      "weather direction and speed must match the selected illustrative condition.",
    );

    const changedPlan = structuredClone(plan);
    changedPlan.openings[0].operable = !changedPlan.openings[0].operable;
    const alteredOpenings = buildScenario({
      plan: changedPlan, geometryContentHash: "geometry-sha256", geometryReleaseEligible: true,
      planRotationDeg: null, mirrored: null, placements: [], weatherCondition: "ne_monsoon", windFromDeg: 45, ambientWindMps: 2.4,
    });
    assert.equal(hasValidScenarioIdentity(alteredOpenings), true);
    assert.equal(
      parseIllustrativeAirflowScenario(alteredOpenings, plan, "geometry-sha256"),
      "opening operating states are not supported by this airflow method.",
    );
  });

  it("rejects a mutated scenario at the identity boundary", () => {
    const plan = getPlanGeometry("tengah-5room");
    const mutated = structuredClone(scenario()) as ReturnType<typeof scenario>;
    mutated.conditions.ambientWindMps = 99;
    assert.equal(
      parseIllustrativeAirflowScenario(mutated, plan, "geometry-sha256"),
      "scenario identity does not match its inputs.",
    );
  });
});

describe("simulation result coordination", () => {
  it("rejects an old arrangement that completes after the active one", () => {
    const oldScenario = scenario(1).scenarioId;
    const activeScenario = scenario(2).scenarioId;
    const current = result(activeScenario, "illustrative_fallback");
    assert.equal(chooseSimulationResult(activeScenario, current, result(oldScenario, "calculated")), current);
  });

  it("defines calculated precedence independent of completion order", () => {
    const active = scenario().scenarioId;
    const calculated = result(active, "calculated");
    const fallback = result(active, "illustrative_fallback");
    assert.equal(chooseSimulationResult(active, fallback, calculated), calculated);
    assert.equal(chooseSimulationResult(active, calculated, fallback), calculated);
  });

  it("clears a result whose scenario no longer matches", () => {
    const oldResult = result(scenario(1).scenarioId, "calculated");
    assert.equal(chooseSimulationResult(scenario(2).scenarioId, oldResult, result(scenario(1).scenarioId, "illustrative_fallback")), null);
  });

  it("does not commit a producer that completes after its coordinator closes", async () => {
    const active = scenario().scenarioId;
    const commits: CoordinatedSimulationResult[] = [];
    const coordinator = createSimulationResultCoordinator(active, (value) => commits.push(value));
    const late = new Promise<void>((resolve) => setTimeout(() => {
      coordinator.offer(result(active, "calculated"));
      resolve();
    }, 5));
    coordinator.close();
    await late;
    assert.deepEqual(commits, []);
  });

  it("keeps calculated output when producers resolve out of order", async () => {
    const active = scenario().scenarioId;
    const commits: CoordinatedSimulationResult[] = [];
    const coordinator = createSimulationResultCoordinator(active, (value) => commits.push(value));
    await Promise.all([
      new Promise<void>((resolve) => setTimeout(() => { coordinator.offer(result(active, "illustrative_fallback")); resolve(); }, 8)),
      new Promise<void>((resolve) => setTimeout(() => { coordinator.offer(result(active, "calculated")); resolve(); }, 2)),
    ]);
    assert.equal(commits.length, 1);
    assert.equal(commits[0].precedence, "calculated");
  });
});
