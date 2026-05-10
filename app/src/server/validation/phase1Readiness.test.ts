import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPhase1ReadinessReport } from "./phase1Readiness";

describe("Phase 1 readiness report", () => {
  it("proves repo implementation completion without hiding external blockers", async () => {
    const report = await buildPhase1ReadinessReport(({ SKETCH_CACHE_PROVIDER: "memory" } as unknown) as NodeJS.ProcessEnv);

    assert.equal(report.repoImplementationComplete, true);
    assert.equal(report.implementation.total, 26);
    assert.equal(report.implementation.complete, 26);
    assert.equal(report.implementation.items.find((item) => item.id === "ghost_futures")?.status, "complete");
    assert.match(report.implementation.items.find((item) => item.id === "kanso_reserve")?.evidence ?? "", /empty-space/);
    assert.match(report.implementation.items.find((item) => item.id === "resonance_hours")?.evidence ?? "", /cooldown/);
    assert.match(report.implementation.items.find((item) => item.id === "floor_golden_floors")?.evidence ?? "", /Golden Floors/);
    assert.match(report.implementation.items.find((item) => item.id === "cultural_designer_modes")?.evidence ?? "", /Cultural mode defaults/);
    assert.equal(report.renderAssets.ok, true);
    assert.equal(report.complete, false);
    assert.equal(report.demoReady, true);
    assert.deepEqual(report.demoBlockers, []);
    assert.equal(report.phase0.pendingExternal, 8);
    assert.ok(report.blockers.some((blocker) => blocker.includes("webgpu_redmi_benchmark")));
    assert.ok(report.blockers.every((blocker) => !blocker.includes("vapid_keypair")));
  });

  it("accepts a full Phase 0 evidence bundle and removes gate blockers", async () => {
    const report = await buildPhase1ReadinessReport(
      ({ SKETCH_CACHE_PROVIDER: "memory" } as unknown) as NodeJS.ProcessEnv,
      completePhase0Evidence(),
    );

    assert.equal(report.phase0.complete, 9);
    assert.equal(report.phase0.pendingExternal, 0);
    assert.equal(report.phase0.items.find((item) => item.id === "webgpu_redmi_benchmark")?.status, "complete");
    assert.equal(report.complete, false);
    assert.equal(report.demoReady, true);
    assert.ok(report.blockers.every((blocker) => !blocker.includes("webgpu_redmi_benchmark")));
    assert.ok(report.blockers.every((blocker) => !blocker.includes("vapid_keypair")));
  });

  it("accepts non-secret operational account evidence without hiding missing keys", async () => {
    const report = await buildPhase1ReadinessReport(
      ({ SKETCH_CACHE_PROVIDER: "memory" } as unknown) as NodeJS.ProcessEnv,
      {},
      { openaiTier2Account: { verified: true, verifiedAtIso: "2026-05-10T00:00:00.000Z" } },
    );

    assert.equal(report.operational.checks.find((check) => check.id === "openai_tier2_account")?.status, "ready");
    assert.ok(report.blockers.every((blocker) => !blocker.includes("openai_tier2_account")));
    assert.ok(report.blockers.some((blocker) => blocker.includes("openai_api_key")));
  });

  it("does not report repo completion when committed demo assets are missing", async () => {
    const report = await buildPhase1ReadinessReport(
      ({ SKETCH_CACHE_PROVIDER: "memory" } as unknown) as NodeJS.ProcessEnv,
      {},
      {},
      { publicRoot: "public-path-that-does-not-exist" },
    );

    assert.equal(report.repoImplementationComplete, false);
    assert.equal(report.demoReady, false);
    assert.ok(report.implementation.complete < 26);
    assert.equal(report.implementation.items.find((item) => item.id === "empty_room_hero_rotation")?.status, "incomplete");
    assert.ok(report.demoBlockers.some((blocker) => blocker.includes("empty_room_hero_rotation")));
  });

  it("can report full completion when all external evidence and live env checks are present", async () => {
    const report = await buildPhase1ReadinessReport(
      ({
        OPENAI_API_KEY: "sk-test",
        NEA_API_KEY: "nea-test",
        SKETCH_CACHE_PROVIDER: "memory",
      } as unknown) as NodeJS.ProcessEnv,
      completePhase0Evidence(),
      { openaiTier2Account: { verified: true, verifiedAtIso: "2026-05-10T00:00:00.000Z" } },
    );

    assert.equal(report.complete, true);
    assert.equal(report.demoReady, true);
    assert.equal(report.repoImplementationComplete, true);
    assert.equal(report.phase0.pendingExternal, 0);
    assert.equal(report.operational.complete, true);
    assert.deepEqual(report.blockers, []);
  });
});

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
