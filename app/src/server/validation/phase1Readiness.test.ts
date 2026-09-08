import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPhase1ReadinessReport, releaseGeometryBlockers, releaseManifestIssues, type ReleaseManifest } from "./phase1Readiness";
import type { GeometryReleaseGateResult } from "@/server/geometry/types";
import { evaluateGeometryReleaseGate } from "@/server/geometry/provenance";
import { coherentShaftlessPlan, verifiedTestEvidence } from "@/server/geometry/testFixtures";

describe("Phase 1 readiness report", () => {
  it("reports incomplete source review and assets without hiding external blockers", async () => {
    const report = await buildPhase1ReadinessReport(({ SKETCH_CACHE_PROVIDER: "memory" } as unknown) as NodeJS.ProcessEnv);

    assert.equal(report.repoImplementationComplete, true);
    assert.equal(report.implementation.total, 2);
    assert.equal(report.implementation.complete, report.implementation.total);
    assert.deepEqual(report.implementation.items.map((item) => item.id), ["jsx_floor_plan_editor", "methodology_page"]);
    assert.equal(report.renderAssets.ok, false);
    assert.equal(report.complete, false);
    assert.equal(report.demoReady, false);
    assert.ok(report.demoBlockers.some((blocker) => blocker.startsWith("geometry_review:")));
    assert.equal(report.phase0.pendingExternal, 0);
    assert.ok(report.blockers.every((blocker) => !blocker.includes("webgpu_redmi_benchmark")));
    assert.ok(report.blockers.every((blocker) => !blocker.includes("vapid_keypair")));
  });

  it("accepts a full Phase 0 evidence bundle and removes gate blockers", async () => {
    const report = await buildPhase1ReadinessReport(
      ({ SKETCH_CACHE_PROVIDER: "memory" } as unknown) as NodeJS.ProcessEnv,
      completePhase0Evidence(),
    );

    assert.equal(report.phase0.complete, 0);
    assert.equal(report.phase0.pendingExternal, 0);
    assert.equal(report.phase0.items.length, 0);
    assert.equal(report.complete, false);
    assert.equal(report.demoReady, false);
    assert.ok(report.blockers.every((blocker) => !blocker.includes("webgpu_redmi_benchmark")));
    assert.ok(report.blockers.every((blocker) => !blocker.includes("vapid_keypair")));
  });

  it("accepts non-secret operational account evidence without hiding missing keys", async () => {
    const report = await buildPhase1ReadinessReport(
      ({ SKETCH_CACHE_PROVIDER: "memory" } as unknown) as NodeJS.ProcessEnv,
      {},
      { openaiTier2Account: { verified: true, verifiedAtIso: "2026-05-10T00:00:00.000Z" } },
      {
        releaseManifest: {
          id: "plan-sketch-test",
          entries: [{ templateId: "tampines-greenweave", capabilities: ["layout_display"], outputs: ["plan_sketch"] }],
        },
      },
    );

    assert.equal(report.operational.checks.find((check) => check.id === "openai_tier2_account")?.status, "ready");
    assert.ok(report.blockers.every((blocker) => !blocker.includes("openai_tier2_account")));
    assert.ok(report.blockers.some((blocker) => blocker.includes("openai_api_key")));
  });

  it("does not require unselected generated assets for a layout-only release", async () => {
    const report = await buildPhase1ReadinessReport(
      ({ SKETCH_CACHE_PROVIDER: "memory" } as unknown) as NodeJS.ProcessEnv,
      {},
      {},
      { publicRoot: "public-path-that-does-not-exist" },
    );

    assert.equal(report.repoImplementationComplete, true);
    assert.equal(report.demoReady, false);
    assert.equal(report.implementation.complete, report.implementation.total);
    assert.equal(report.implementation.items.some((item) => item.id === "empty_room_hero_rotation"), false);
  });

  it("does not let external demo evidence override missing geometry review", async () => {
    const report = await buildPhase1ReadinessReport(
      ({
        OPENAI_API_KEY: "sk-test",
        NEA_API_KEY: "nea-test",
        SKETCH_CACHE_PROVIDER: "memory",
      } as unknown) as NodeJS.ProcessEnv,
      completePhase0Evidence(),
      { openaiTier2Account: { verified: true, verifiedAtIso: "2026-05-10T00:00:00.000Z" } },
    );

    assert.equal(report.complete, false);
    assert.equal(report.demoReady, false);
    assert.equal(report.repoImplementationComplete, true);
    assert.equal(report.phase0.pendingExternal, 0);
    assert.equal(report.operational.complete, true);
    assert.ok(report.blockers.some((blocker) => blocker.startsWith("geometry_review:")));
  });

  it("allows one eligible shaftless layout-only template without evaluating unreleased templates", () => {
    const manifest: ReleaseManifest = {
      id: "layout-only-test",
      entries: [{ templateId: "tampines-greenweave", capabilities: ["layout_display"], outputs: ["plan_svg"] }],
    };
    const plan = coherentShaftlessPlan();
    const [source, review] = verifiedTestEvidence(plan);
    const gate = evaluateGeometryReleaseGate(plan, source, review, manifest);
    assert.equal(plan.pipeshaft, undefined);
    assert.equal(gate.eligible, true);
    const requested: string[] = [];
    const blockers = releaseGeometryBlockers(manifest, (templateId) => {
      requested.push(templateId);
      return gate;
    });

    assert.deepEqual(blockers, []);
    assert.deepEqual(requested, ["tampines-greenweave"]);
  });

  it("passes a complete layout-only report for an injected coherent shaftless plan", async () => {
    const manifest: ReleaseManifest = {
      id: "layout-only-test",
      entries: [{ templateId: "tampines-greenweave", capabilities: ["layout_display"], outputs: ["plan_svg"] }],
    };
    const plan = coherentShaftlessPlan();
    const [source, review] = verifiedTestEvidence(plan);
    const gate = evaluateGeometryReleaseGate(plan, source, review, manifest);
    assert.equal(gate.eligible, true);
    assert.equal(gate.capabilities.layoutDisplay.available, true);
    assert.equal(gate.capabilities.shaftAdvice.available, false);
    const report = await buildPhase1ReadinessReport(
      {} as NodeJS.ProcessEnv,
      {},
      {},
      {
        publicRoot: "public-path-that-does-not-exist",
        releaseManifest: manifest,
        gateForTemplate: () => gate,
        planForTemplate: () => plan,
      },
    );

    assert.equal(report.complete, true);
    assert.equal(report.demoReady, true);
    assert.deepEqual(report.operational.checks, []);
    assert.deepEqual(report.phase0.items, []);
    assert.equal(report.renderAssets.ok, false);
    assert.deepEqual(report.blockers, []);
  });

  it("keeps unavailable selected capabilities blocked even when geometry is approved", () => {
    const manifest: ReleaseManifest = {
      id: "weather-test",
      entries: [{ templateId: "tampines-greenweave", capabilities: ["home_weather_alignment"], outputs: [] }],
    };

    assert.match(
      releaseGeometryBlockers(manifest, () => eligibleGate({ homeWeatherAlignment: false }))[0],
      /home_weather_alignment/,
    );
  });

  it("rejects empty, duplicate, and output-inconsistent release manifests actionably", () => {
    assert.match(releaseManifestIssues({ id: "", entries: [] }).join("\n"), /id is required.*select at least one template/s);
    assert.match(
      releaseManifestIssues({
        id: "invalid",
        entries: [
          { templateId: "tampines-greenweave", capabilities: ["layout_display", "layout_display"], outputs: ["wind_sketch"] },
          { templateId: "tampines-greenweave", capabilities: ["layout_display"], outputs: [] },
        ],
      }).join("\n"),
      /unique.*illustrative_airflow.*duplicate/s,
    );
  });
});

function eligibleGate(
  capabilityOverrides: Partial<Record<keyof GeometryReleaseGateResult["capabilities"], boolean>>,
): GeometryReleaseGateResult {
  const capability = (key: keyof GeometryReleaseGateResult["capabilities"]) => ({
    available: capabilityOverrides[key] ?? true,
    reason: capabilityOverrides[key] === false ? `${key} test prerequisite is absent.` : null,
  });
  return {
    eligible: true,
    basicValidation: { ok: true, issues: [] },
    topology: { ok: true, issues: [] },
    provenance: {
      ok: true,
      issues: [],
      geometrySha256: "a".repeat(64),
      statuses: {
        sourceAuthenticity: "verified",
        geometricAccuracy: "verified",
        asBuiltConfirmation: "not_applicable",
        renovationApproval: "not_applicable",
      },
    },
    capabilities: {
      layoutDisplay: capability("layoutDisplay"),
      placementAdvice: capability("placementAdvice"),
      illustrativeAirflow: capability("illustrativeAirflow"),
      homeWeatherAlignment: capability("homeWeatherAlignment"),
      shaftAdvice: capability("shaftAdvice"),
      orientationAnalysis: capability("orientationAnalysis"),
    },
  };
}

function completePhase0Evidence() {
  return {
    empty_room_beauty: {
      renderOutcomes: Array.from({ length: 20 }, (_, index) => ({
        renderId: `e${index}`,
        beautiful: index < 12,
        morningEastLight: index < 2,
        eveningWestAmber: index === 2,
        highNoonSouthDominant: false,
      })),
    },
    life_sketch_preservation: {
      templateOutcomes: [
        preservedLifeSketch("resale-exec-1990s"),
        preservedLifeSketch("tampines-greenweave"),
        preservedLifeSketch("tengah-5room"),
      ],
    },
    webgpu_redmi_benchmark: {
      device: "Redmi Note 13",
      fpsSamples: [31, 30, 32, 29, 33],
      tier4LookupSamples: [
        { templateId: "resale-exec-1990s", lookupMs: [75, 83] },
        { templateId: "tampines-greenweave", lookupMs: [68, 74] },
        { templateId: "tengah-5room", lookupMs: [72, 79] },
      ],
    },
    live_studio_comprehension: {
      testerOutcomes: Array.from({ length: 10 }, (_, index) => ({
        testerId: `l${index}`,
        identifiedWindMoving: true,
        identifiedWithinSeconds: index < 8 ? 5 : 6,
      })),
    },
    magic_90_seconds: {
      testerOutcomes: Array.from({ length: 10 }, (_, index) => ({
        testerId: `m${index}`,
        understoodTokenChangesAir: index < 8,
        understoodWithinSeconds: index < 8 ? 30 : 45,
      })),
    },
    behavioral_overconfidence: {
      testerOutcomes: Array.from({ length: 10 }, (_, index) => ({
        testerId: `b${index}`,
        discussionOrientedLanguage: true,
        commitmentLanguage: index >= 8,
      })),
    },
    resonance_historical_wind: {
      templateWeeks: [
        { templateId: "resale-exec-1990s", weeklyFires: [1, 2, 3, 4] },
        { templateId: "tampines-greenweave", weeklyFires: [2, 2, 3, 3] },
        { templateId: "tengah-5room", weeklyFires: [1, 1, 2, 2] },
      ],
    },
    material_slider_comprehension: {
      testerOutcomes: Array.from({ length: 10 }, (_, index) => ({
        testerId: `s${index}`,
        articulatedChange: index < 8,
        withoutPrompting: true,
      })),
    },
  };
}

function preservedLifeSketch(templateId: string) {
  return {
    templateId,
    roomCountsPreserved: true,
    wallTopologyPreserved: true,
    hdbSignaturesPreserved: true,
  };
}
