import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildScenario, createSimulationResultCoordinator, type CoordinatedSimulationResult, type ScenarioBoundSimulationResult } from "@/lib/scenario";
import { isPngImage } from "@/lib/png";
import { coherentShaftlessPlan, verifiedTestEvidence } from "@/server/geometry/testFixtures";
import { evaluateGeometryReleaseGate } from "@/server/geometry/provenance";
import { getGeometryReleaseGate } from "@/server/geometry/registry";
import { renderTopologyProofSvg, renderWindSketchSvg } from "@/server/openai/fallbackSvg";
import { rasterizeSvgToPng } from "@/server/openai/svgRaster";
import { createSimulationHandler } from "./http";
import { composeTier1Field, WEATHER_TRIALS } from "./fieldBuilders";
import type { VelocityField } from "@/server/lbm/types";
import type { ReleaseManifest } from "@/server/geometry/releaseManifest";

const TEST_RELEASE: ReleaseManifest = { id: "synthetic-software-test", entries: [{
  templateId: "tampines-greenweave", capabilities: ["layout_display", "illustrative_airflow"], outputs: ["plan_svg", "wind_sketch"],
}] };

function fixture() {
  const plan = coherentShaftlessPlan();
  const gate = evaluateGeometryReleaseGate(plan, ...verifiedTestEvidence(plan), TEST_RELEASE);
  assert.equal(gate.eligible, true);
  const data = new Float32Array(32 * 32 * 2);
  for (let index = 0; index < 32 * 32; index++) data[index * 2] = 0.05;
  const field: VelocityField = { width: 32, height: 32, data };
  let calls = 0;
  const handler = createSimulationHandler({
    getPlan: () => plan, getGate: () => gate,
    simulate: async (input) => {
      assert.notEqual(typeof input, "string");
      if (typeof input === "string") throw new Error(input);
      calls++;
      return composeTier1Field({ templateId: plan.templateId, field, condition: WEATHER_TRIALS[input.condition],
        tokenPlacements: input.tokenPlacements, iterations: 0 }, { plan });
    },
  });
  const scenario = (condition: "ne_monsoon" | "sw_monsoon") => buildScenario({
    plan, geometryContentHash: gate.provenance.geometrySha256, geometryReleaseEligible: true,
    planRotationDeg: null, mirrored: null, placements: [], weatherCondition: condition,
    windFromDeg: WEATHER_TRIALS[condition].compassDeg, ambientWindMps: WEATHER_TRIALS[condition].ambientWindMps,
  });
  return { plan, gate, handler, scenario, calls: () => calls };
}

const request = (scenario: unknown) => new Request("http://localhost/api/simulation", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenario }),
});

describe("permitted synthetic workflow (software evidence only)", () => {
  it("accepts supported scenario changes and preserves their identity through rendering and PNG export", async () => {
    const setup = fixture();
    const first = setup.scenario("ne_monsoon");
    const second = setup.scenario("sw_monsoon");
    assert.notEqual(first.scenarioId, second.scenarioId);
    const commits: CoordinatedSimulationResult[] = [];
    const coordinator = createSimulationResultCoordinator(second.scenarioId, (value) => commits.push(value));
    for (const scenario of [second, first]) {
      const response = await setup.handler(request(scenario));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      const result: ScenarioBoundSimulationResult = await response.json();
      assert.equal(result.inputHash, scenario.inputHash);
      assert.equal(result.scenarioId, scenario.scenarioId);
      assert.equal(result.method.evidence, "prototype_visualisation");
      assert.ok(result.field.streamlines.length > 0);
      assert.ok(result.field.streamlines.every((line) => line.id !== "pipeshaft-drift"));
      coordinator.offer({ ...result, precedence: "calculated" });
      coordinator.offer({ ...result, precedence: "illustrative_fallback" });
    }
    assert.equal(setup.calls(), 2);
    assert.equal(commits.length, 1);
    assert.equal(commits[0].scenarioId, second.scenarioId);
    const windSvg = renderWindSketchSvg(setup.plan, commits[0].field);
    assert.match(windSvg, /data-layer="deterministic-streamlines"/);
    assert.match(windSvg, /PROTOTYPE VISUALISATION/);
    assert.doesNotMatch(windSvg, /NaN|Infinity|data-particle-id="pipeshaft/);
    const planSvg = renderTopologyProofSvg(setup.plan);
    for (const svg of [planSvg, windSvg]) {
      const raster = await rasterizeSvgToPng(svg, 512);
      assert.equal(raster.ok, true, "Release export validation requires the installed resvg rasterizer.");
      if (raster.ok) assert.equal(isPngImage(raster.png), true);
    }
    // Injection never grants eligibility to the production registry.
    assert.equal(getGeometryReleaseGate(setup.plan.templateId).eligible, false);
  });

  it("rejects an unsupported but hash-consistent scenario before invoking the producer", async () => {
    const setup = fixture();
    const unsupported = buildScenario({
      plan: setup.plan, geometryContentHash: setup.gate.provenance.geometrySha256, geometryReleaseEligible: true,
      planRotationDeg: 90, mirrored: null, placements: [], weatherCondition: "ne_monsoon",
      windFromDeg: 45, ambientWindMps: 2.4,
    });
    const response = await setup.handler(request(unsupported));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error,
      "illustrative airflow currently supports plan-relative orientation only; rotation and mirroring must be unknown.");
    assert.equal(setup.calls(), 0);
  });

  it("does not confuse an approved layout with an eligible airflow capability", async () => {
    const setup = fixture();
    setup.plan.openings = [];
    const gate = evaluateGeometryReleaseGate(setup.plan, ...verifiedTestEvidence(setup.plan), TEST_RELEASE);
    assert.equal(gate.eligible, true);
    let calls = 0;
    const handler = createSimulationHandler({ getPlan: () => setup.plan, getGate: () => gate,
      simulate: async () => { calls++; throw new Error("Capability must block this producer"); } });
    const response = await handler(new Request("http://localhost/api/simulation", {
      method: "POST", body: JSON.stringify({ templateId: setup.plan.templateId }),
    }));
    assert.equal(response.status, 422);
    assert.equal((await response.json()).error, "geometry_capability_not_ready");
    assert.equal(calls, 0);
  });
});
