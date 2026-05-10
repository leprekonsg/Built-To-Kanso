import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluatePhase0Gate } from "./phase0Gates";

describe("Phase 0 gate evaluator", () => {
  it("requires Empty Room beauty and tropical-light constraints", () => {
    const result = evaluatePhase0Gate("empty_room_beauty", {
      renderOutcomes: Array.from({ length: 20 }, (_, index) => ({
        renderId: `empty-${index}`,
        beautiful: index < 12,
        morningEastLight: index < 2,
        eveningWestAmber: index === 2,
        highNoonSouthDominant: false,
      })),
    });

    assert.equal(result.passed, true);
    assert.match(result.observed, /12\/20 beautiful/);
  });

  it("rejects Empty Room evidence with high-noon south-dominant scenes", () => {
    const result = evaluatePhase0Gate("empty_room_beauty", {
      renderOutcomes: Array.from({ length: 20 }, (_, index) => ({
        renderId: `empty-${index}`,
        beautiful: index < 20,
        morningEastLight: index < 2,
        eveningWestAmber: index === 2,
        highNoonSouthDominant: index === 3,
      })),
    });

    assert.equal(result.passed, false);
    assert.match(result.missing.join(" "), /High-noon south-dominant scenes are rejected/);
  });

  it("passes Material slider evidence only with unprompted articulation", () => {
    const pass = evaluatePhase0Gate("material_slider_comprehension", {
      testerOutcomes: Array.from({ length: 10 }, (_, index) => ({
        testerId: `t${index}`,
        articulatedChange: index < 8,
        withoutPrompting: true,
      })),
    });
    assert.equal(pass.passed, true);
    assert.equal(pass.observed, "8/10");

    const pending = evaluatePhase0Gate("material_slider_comprehension", {
      testerOutcomes: Array.from({ length: 9 }, (_, index) => ({
        testerId: `t${index}`,
        articulatedChange: index < 8,
        withoutPrompting: true,
      })),
    });
    assert.equal(pending.passed, false);
    assert.match(pending.missing.join(" "), /Need 1 more tester outcomes/);
  });

  it("requires Live Studio viewers to identify wind within 5 seconds", () => {
    const result = evaluatePhase0Gate("live_studio_comprehension", {
      testerOutcomes: Array.from({ length: 10 }, (_, index) => ({
        testerId: `l${index}`,
        identifiedWindMoving: true,
        identifiedWithinSeconds: index < 8 ? 5 : 6,
      })),
    });

    assert.equal(result.passed, true);
    assert.match(result.summary, /identifying wind within 5 seconds/);
  });

  it("requires the magic moment to be understood within 30 seconds", () => {
    const result = evaluatePhase0Gate("magic_90_seconds", {
      testerOutcomes: Array.from({ length: 10 }, (_, index) => ({
        testerId: `m${index}`,
        understoodTokenChangesAir: index < 8,
        understoodWithinSeconds: index < 8 ? 30 : 45,
      })),
    });

    assert.equal(result.passed, true);
    assert.match(result.required, /within 30 seconds/);
  });

  it("rejects Behavioral overconfidence evidence with commitment language", () => {
    const result = evaluatePhase0Gate("behavioral_overconfidence", {
      testerOutcomes: Array.from({ length: 10 }, (_, index) => ({
        testerId: `b${index}`,
        discussionOrientedLanguage: true,
        commitmentLanguage: index >= 8,
      })),
    });

    assert.equal(result.passed, true);

    const reject = evaluatePhase0Gate("behavioral_overconfidence", {
      testerOutcomes: Array.from({ length: 10 }, (_, index) => ({
        testerId: `b${index}`,
        discussionOrientedLanguage: true,
        commitmentLanguage: index >= 7,
      })),
    });

    assert.equal(reject.passed, false);
    assert.match(reject.missing.join(" "), /discussion-oriented language/);
  });

  it("requires GPT Image Life Sketch preservation evidence for all Phase 1 templates", () => {
    const result = evaluatePhase0Gate("life_sketch_preservation", {
      templateOutcomes: [
        preservedLifeSketch("resale-exec-1990s"),
        preservedLifeSketch("tampines-greenweave"),
        preservedLifeSketch("tengah-5room"),
      ],
    });

    assert.equal(result.passed, true);
    assert.equal(result.missing.length, 0);
  });

  it("rejects Life Sketch evidence that omits a preservation dimension", () => {
    const result = evaluatePhase0Gate("life_sketch_preservation", {
      templateOutcomes: [
        preservedLifeSketch("resale-exec-1990s"),
        preservedLifeSketch("tampines-greenweave"),
        {
          templateId: "tengah-5room",
          roomCountsPreserved: true,
          wallTopologyPreserved: true,
          hdbSignaturesPreserved: false,
        },
      ],
    });

    assert.equal(result.passed, false);
    assert.match(result.missing.join(" "), /tengah-5room: hdbSignaturesPreserved must be true/);
  });

  it("requires Redmi Note 13 WebGPU median fps at or above 30", () => {
    const result = evaluatePhase0Gate("webgpu_redmi_benchmark", {
      device: "Redmi Note 13",
      fpsSamples: [31, 29, 33, 30, 32],
      tier4LookupSamples: tier4LookupSamples(),
    });

    assert.equal(result.passed, true);
    assert.match(result.summary, /median 31\.0fps/);
  });

  it("requires Tier 4 lookup samples under 200ms for all Phase 1 templates", () => {
    const result = evaluatePhase0Gate("webgpu_redmi_benchmark", {
      device: "Redmi Note 13",
      fpsSamples: [31, 29, 33, 30, 32],
      tier4LookupSamples: [
        { templateId: "resale-exec-1990s", lookupMs: [75, 83] },
        { templateId: "tampines-greenweave", lookupMs: [68, 74] },
        { templateId: "tengah-5room", lookupMs: [199, 201] },
      ],
    });

    assert.equal(result.passed, false);
    assert.match(result.missing.join(" "), /tengah-5room has Tier 4 lookup samples/);
  });

  it("requires one-month historical Resonance frequency evidence for all templates", () => {
    const result = evaluatePhase0Gate("resonance_historical_wind", {
      templateWeeks: [
        { templateId: "resale-exec-1990s", weeklyFires: [1, 2, 3, 4] },
        { templateId: "tampines-greenweave", weeklyFires: [2, 2, 3, 3] },
        { templateId: "tengah-5room", weeklyFires: [1, 1, 2, 2] },
      ],
    });

    assert.equal(result.passed, true);
  });

  it("reports actionable missing evidence instead of passing empty input", () => {
    const result = evaluatePhase0Gate("empty_room_beauty", {});

    assert.equal(result.passed, false);
    assert.deepEqual(result.missing, ["renderOutcomes must be an array."]);
  });
});

function tier4LookupSamples() {
  return [
    { templateId: "resale-exec-1990s", lookupMs: [75, 83] },
    { templateId: "tampines-greenweave", lookupMs: [68, 74] },
    { templateId: "tengah-5room", lookupMs: [72, 79] },
  ];
}

function preservedLifeSketch(templateId: string) {
  return {
    templateId,
    roomCountsPreserved: true,
    wallTopologyPreserved: true,
    hdbSignaturesPreserved: true,
  };
}
