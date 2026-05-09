import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlanGeometry } from "@/server/geometry/types";
import { evaluateQuiet } from "./quiet";
import { renderDampedRippleSvg } from "./quietRender";

function makePlan(overrides?: Partial<PlanGeometry>): PlanGeometry {
  const base: PlanGeometry = {
    schemaVersion: 1,
    templateId: "tampines-greenweave",
    units: "meters",
    source: "architect_curated_template",
    bounds: { x: 0, y: 0, width: 10, height: 8 },
    openingAreaPct: 14,
    westSunFacadeDeg: 270,
    defaultDoorFacingDeg: 45,
    rooms: [
      { id: "living", label: "Living", kind: "living", confidence: "green", x: 0, y: 0, width: 5, height: 4 },
      { id: "bedroom", label: "Bedroom", kind: "bedroom", confidence: "green", x: 5, y: 0, width: 4, height: 4 },
      { id: "kitchen", label: "Kitchen", kind: "kitchen", confidence: "green", x: 0, y: 4, width: 4, height: 4 },
    ],
    openings: [],
    fixedElements: [],
    pipeshaft: {
      id: "shaft",
      roomId: "kitchen",
      openingPoint: { x: 1, y: 6 },
      openingDirectionDeg: 0,
      jetVelocityMps: [0.15, 0.25],
      bufferRadiusM: 0.6,
      downwindRoomIds: [],
    },
    bathrooms: [],
  };
  return { ...base, ...overrides };
}

describe("evaluateQuiet", () => {
  it("estimates living-room RT60 from room volume and Designer material quantities", () => {
    const bare = evaluateQuiet({ plan: makePlan(), floor: 8 });
    const softened = evaluateQuiet({
      plan: makePlan(),
      floor: 8,
      materialQuantities: {
        curtainM2: 8,
        rugM2: 9,
        upholsteredSeatCount: 4,
        acousticPanelM2: 2,
      },
    });

    assert.ok(bare.rt60Seconds > 0.6, `got ${bare.rt60Seconds}`);
    assert.ok(softened.rt60Seconds < bare.rt60Seconds);
    assert.ok(softened.designerQuantities.absorptionAreaM2 > bare.designerQuantities.absorptionAreaM2);
    assert.equal(softened.rt60TargetSeconds.min, 0.4);
    assert.equal(softened.rt60TargetSeconds.max, 0.6);
    assert.match(softened.designerSummary, /curtain 8m2/);
  });

  it("estimates bedroom night noise against the 30 dB LAeq target", () => {
    const reading = evaluateQuiet({
      plan: makePlan(),
      floor: 4,
      nightFacadeNoiseDba: 58,
      windowClosedReductionDba: 24,
    });

    assert.equal(reading.bedroomNoiseTargetDba, 30);
    assert.equal(reading.bedroomNoiseDba, 34);
    assert.ok(reading.askingPoints.some((point) => point.id === "quiet-bedroom-noise"));
    assert.match(reading.designerSummary, /34 dB LAeq/);
  });

  it("stays settled when RT60 and bedroom noise are inside target", () => {
    const reading = evaluateQuiet({
      plan: makePlan(),
      floor: 12,
      nightFacadeNoiseDba: 52,
      windowClosedReductionDba: 24,
      materialQuantities: {
        curtainM2: 8,
        rugM2: 8,
        upholsteredSeatCount: 4,
      },
    });

    assert.equal(reading.band, "settled");
    assert.ok(reading.rt60Seconds >= 0.4 && reading.rt60Seconds <= 0.6, `got ${reading.rt60Seconds}`);
    assert.ok(reading.bedroomNoiseDba <= 30);
  });

  it("caps Asking Points at three and avoids alarmist language", () => {
    const reading = evaluateQuiet({
      plan: makePlan(),
      floor: 25,
      nightFacadeNoiseDba: 70,
      windowClosedReductionDba: 18,
    });

    assert.ok(reading.askingPoints.length <= 3);
    assert.doesNotMatch(
      `${reading.culturalSummary} ${reading.designerSummary} ${reading.askingPoints.map((point) => point.copy).join(" ")}`,
      /danger|severe|critical|emergency/i,
    );
  });

  it("raises the bedroom noise band when the plan is PIE-adjacent at 80m", () => {
    // Use a higher window reduction so baseline (58 dBA - 30 = 28 dB LAeq) stays inside the 30 target.
    // PIE-adjacent baseline (68 + 2 - 30 = 40 dB LAeq) breaches the target.
    const baseline = evaluateQuiet({
      plan: makePlan(),
      floor: 12,
      windowClosedReductionDba: 30,
      materialQuantities: { curtainM2: 8, rugM2: 8, upholsteredSeatCount: 4 },
    });
    const pieAdjacent = evaluateQuiet({
      plan: makePlan({
        siteContext: { expresswayAdjacency: "near_pie", expresswayDistanceM: 80 },
      }),
      floor: 12,
      windowClosedReductionDba: 30,
      materialQuantities: { curtainM2: 8, rugM2: 8, upholsteredSeatCount: 4 },
    });

    assert.equal(baseline.expresswayAdjacency, "none");
    assert.equal(baseline.facadeBaselineDba, 58);
    assert.equal(pieAdjacent.expresswayAdjacency, "near_pie");
    // 68 baseline + 2 dB distance modifier (<=80m).
    assert.equal(pieAdjacent.facadeBaselineDba, 70);
    assert.ok(pieAdjacent.bedroomNoiseDba > baseline.bedroomNoiseDba);
    assert.ok(baseline.bedroomNoiseDba <= 30);
    assert.equal(pieAdjacent.band, "soften");
    assert.notEqual(baseline.band, "soften");
  });

  it("preserves baseline behavior when adjacency is none", () => {
    const explicitNone = evaluateQuiet({
      plan: makePlan({ siteContext: { expresswayAdjacency: "none" } }),
      floor: 8,
    });
    const noContext = evaluateQuiet({ plan: makePlan(), floor: 8 });
    assert.equal(explicitNone.bedroomNoiseDba, noContext.bedroomNoiseDba);
    assert.equal(explicitNone.facadeBaselineDba, 58);
    assert.equal(explicitNone.expresswayAdjacency, "none");
  });
});

describe("renderDampedRippleSvg", () => {
  it("produces byte-identical output for the same input", () => {
    const plan = makePlan({
      siteContext: { expresswayAdjacency: "near_pie", expresswayDistanceM: 80 },
    });
    const reading = evaluateQuiet({ plan, floor: 8 });
    const a = renderDampedRippleSvg(plan, reading);
    const b = renderDampedRippleSvg(plan, reading);
    assert.equal(a, b);
    assert.match(a, /data-layer="quiet-damped-ripple"/);
    assert.match(a, /data-adjacency="near_pie"/);
  });

  it("reduces ripple opacity when absorption area is large", () => {
    const plan = makePlan({
      siteContext: { expresswayAdjacency: "near_pie", expresswayDistanceM: 80 },
    });
    const bare = evaluateQuiet({ plan, floor: 8 });
    const softened = evaluateQuiet({
      plan,
      floor: 8,
      materialQuantities: {
        curtainM2: 12,
        rugM2: 12,
        upholsteredSeatCount: 6,
        acousticPanelM2: 4,
      },
    });

    assert.ok(softened.designerQuantities.absorptionAreaM2 > bare.designerQuantities.absorptionAreaM2);
    const bareSvg = renderDampedRippleSvg(plan, bare);
    const softenedSvg = renderDampedRippleSvg(plan, softened);
    const bareOpacities = extractOpacities(bareSvg);
    const softenedOpacities = extractOpacities(softenedSvg);
    assert.equal(bareOpacities.length, softenedOpacities.length);
    for (let i = 0; i < bareOpacities.length; i += 1) {
      assert.ok(
        softenedOpacities[i] <= bareOpacities[i],
        `ripple ${i}: softened ${softenedOpacities[i]} > bare ${bareOpacities[i]}`,
      );
    }
    // At least one ripple must drop in opacity (not all clamped to floor).
    assert.ok(softenedOpacities.some((value, i) => value < bareOpacities[i]));
  });

  it("emits an inactive group when the plan has no expressway adjacency", () => {
    const plan = makePlan();
    const reading = evaluateQuiet({ plan, floor: 8 });
    const svg = renderDampedRippleSvg(plan, reading);
    assert.match(svg, /data-state="inactive"/);
  });
});

function extractOpacities(svg: string): number[] {
  const matches = svg.match(/opacity="[\d.]+"/g) ?? [];
  return matches.map((entry) => Number(entry.slice(9, -1)));
}
