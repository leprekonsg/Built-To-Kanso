import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { listGeometrySummaries } from "@/server/geometry/registry";
import { buildTier4Simulation, validateSimulationRequest } from "./tier4";
import type { SimulationRequestInput, ValidSimulationRequest } from "./tier4";

describe("buildTier4Simulation", () => {
  it("returns distinct deterministic fields for weather trial conditions", () => {
    const base = {
      templateId: "tampines-greenweave",
      tokenPlacements: [],
    };
    const ne = validRequest({ ...base, condition: "ne_monsoon" });
    const sw = validRequest({ ...base, condition: "sw_monsoon" });
    const still = validRequest({ ...base, condition: "west_sun_still_air" });

    const neField = buildTier4Simulation(ne);
    const swField = buildTier4Simulation(sw);
    const stillField = buildTier4Simulation(still);

    assert.equal(neField.condition.id, "ne_monsoon");
    assert.equal(swField.condition.id, "sw_monsoon");
    assert.equal(stillField.condition.id, "west_sun_still_air");
    assert.equal(neField.source.kind, "prebaked_fallback");
    assert.equal(swField.source.kind, "prebaked_fallback");
    assert.equal(stillField.source.kind, "prebaked_fallback");
    assert.equal(neField.simulationSource.kind, "prebaked_fallback");
    assert.equal(neField.simulationSource.adapter, "prebaked");

    assert.notDeepEqual(neField.velocitySamples, swField.velocitySamples);
    assert.notDeepEqual(neField.velocitySamples, stillField.velocitySamples);
    assert.notDeepEqual(neField.streamlines, swField.streamlines);
  });

  it("rejects unknown weather trial conditions with an actionable message listing all seven IDs", () => {
    const validation = validateSimulationRequest({
      templateId: "tampines-greenweave",
      condition: "rainy",
      tokenPlacements: [],
    });

    assert.equal(
      validation,
      "weatherCondition must be one of: baseline_monsoon, ne_monsoon, sw_monsoon, west_sun_still_air, west_sun_1720, highway_night, ne_monsoon_wind.",
    );
  });

  it("accepts the three brief Weather Trial conditions via the condition parameter", () => {
    for (const trialId of ["west_sun_1720", "highway_night", "ne_monsoon_wind"] as const) {
      const trial = validRequest({
        templateId: "tampines-greenweave",
        tokenPlacements: [],
        condition: trialId,
      });
      const field = buildTier4Simulation(trial);
      assert.equal(field.condition.id, trialId);
    }
  });

  it("expands pipeshaft drift into a directional jet field of three particles", () => {
    const trial = validRequest({
      templateId: "tampines-greenweave",
      tokenPlacements: [],
    });
    const field = buildTier4Simulation(trial);
    const drift = field.particles.filter((p) => p.kind === "pipeshaft_drift");

    assert.equal(drift.length, 3, `expected 3 pipeshaft particles, got ${drift.length}`);
    assert.ok(drift.every((p) => p.material === "hdb_concrete_dust"));
    // Each subsequent particle has a later delay (cascade through the jet).
    for (let i = 1; i < drift.length; i++) {
      assert.ok(drift[i].delayMs > drift[i - 1].delayMs);
    }
  });

  it("keeps Tier 4 local lookup under the Phase 0 200ms benchmark across Phase 1 templates", () => {
    const conditionIds = ["west_sun_1720", "highway_night", "ne_monsoon_wind"] as const;
    let slowestMs = 0;

    for (const summary of listGeometrySummaries()) {
      for (const condition of conditionIds) {
        const request = validRequest({
          templateId: summary.templateId,
          tokenPlacements: [],
          condition,
        });
        const started = process.hrtime.bigint();
        const field = buildTier4Simulation(request);
        const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;
        slowestMs = Math.max(slowestMs, elapsedMs);

        assert.equal(field.source.adapter, "prebaked");
        assert.ok(
          elapsedMs < 200,
          `${summary.templateId}/${condition} Tier 4 lookup took ${elapsedMs.toFixed(2)}ms; expected <200ms`,
        );
      }
    }

    assert.ok(slowestMs > 0);
  });
});

function validRequest(input: SimulationRequestInput): ValidSimulationRequest {
  const validation = validateSimulationRequest(input);
  if (typeof validation === "string") {
    assert.fail(validation);
  }
  return validation;
}
