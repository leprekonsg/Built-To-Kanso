import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getPlanGeometry } from "@/server/geometry/registry";
import { buildTier4Simulation } from "@/server/simulation/tier4";
import type { Tier4SimulationField, SimulationStreamline } from "@/server/simulation/types";
import { findSumiInkCrossings, renderWindSketchSvg } from "./fallbackSvg";

function baseField(): Tier4SimulationField {
  return buildTier4Simulation({
    templateId: "tampines-greenweave",
    tokenPlacements: [],
    candidatePositions: [],
    condition: "ne_monsoon",
  });
}

function withStreamlines(field: Tier4SimulationField, streamlines: SimulationStreamline[]): Tier4SimulationField {
  return { ...field, streamlines };
}

describe("Wind Sketch sumi-e brush filters", () => {
  it("findSumiInkCrossings detects a real crossing between two sumi_ink streamlines", () => {
    const field = baseField();
    const lines: SimulationStreamline[] = [
      {
        id: "ink-a",
        material: "sumi_ink",
        speedMps: 0.4,
        points: [
          { x: 0, y: 0 },
          { x: 4, y: 4 },
        ],
      },
      {
        id: "ink-b",
        material: "sumi_ink",
        speedMps: 0.4,
        points: [
          { x: 0, y: 4 },
          { x: 4, y: 0 },
        ],
      },
    ];
    const crossings = findSumiInkCrossings(lines);
    assert.equal(crossings.length, 1);
    assert.deepEqual(crossings[0].ids, ["ink-a", "ink-b"]);
    assert.ok(Math.abs(crossings[0].x - 2) < 1e-6);
    assert.ok(Math.abs(crossings[0].y - 2) < 1e-6);

    const svg = renderWindSketchSvg(getPlanGeometry(field.templateId), withStreamlines(field, lines));
    assert.match(svg, /data-layer="ink-bleed-crossings"/);
    assert.match(svg, /data-streamline-pair="ink-a\|ink-b"/);
    assert.match(svg, /filter="url\(#ink-bleed\)"/);
  });

  it("findSumiInkCrossings ignores intersections involving silk_ribbon streamlines", () => {
    const lines: SimulationStreamline[] = [
      {
        id: "silk-a",
        material: "silk_ribbon",
        speedMps: 0.4,
        points: [
          { x: 0, y: 0 },
          { x: 4, y: 4 },
        ],
      },
      {
        id: "ink-b",
        material: "sumi_ink",
        speedMps: 0.4,
        points: [
          { x: 0, y: 4 },
          { x: 4, y: 0 },
        ],
      },
    ];
    assert.equal(findSumiInkCrossings(lines).length, 0);
  });

  it("returns an empty crossings list when sumi_ink streamlines do not cross", () => {
    const lines: SimulationStreamline[] = [
      {
        id: "ink-a",
        material: "sumi_ink",
        speedMps: 0.4,
        points: [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
        ],
      },
      {
        id: "ink-b",
        material: "sumi_ink",
        speedMps: 0.4,
        points: [
          { x: 0, y: 2 },
          { x: 4, y: 2 },
        ],
      },
    ];
    assert.equal(findSumiInkCrossings(lines).length, 0);

    const field = withStreamlines(baseField(), lines);
    const svg = renderWindSketchSvg(getPlanGeometry(field.templateId), field);
    assert.doesNotMatch(svg, /data-layer="ink-bleed-crossings"/);
  });

  it("renders byte-identical SVG bytes for the same (plan, field) input", () => {
    const field = baseField();
    const plan = getPlanGeometry(field.templateId);
    const a = renderWindSketchSvg(plan, field);
    const b = renderWindSketchSvg(plan, field);
    assert.equal(a, b);
    // Seed is exposed on the streamlines layer so two clients computing the
    // same condition.id agree on the kasure displacement field.
    assert.match(a, /data-kasure-seed="\d+"/);
  });

  it("varies the kasure seed by condition.id so different weather renders differ", () => {
    const ne = buildTier4Simulation({
      templateId: "tampines-greenweave",
      tokenPlacements: [],
      candidatePositions: [],
      condition: "ne_monsoon",
    });
    const sw = buildTier4Simulation({
      templateId: "tampines-greenweave",
      tokenPlacements: [],
      candidatePositions: [],
      condition: "sw_monsoon",
    });
    const plan = getPlanGeometry(ne.templateId);
    const seedNe = renderWindSketchSvg(plan, ne).match(/data-kasure-seed="(\d+)"/)?.[1];
    const seedSw = renderWindSketchSvg(plan, sw).match(/data-kasure-seed="(\d+)"/)?.[1];
    assert.ok(seedNe && seedSw);
    assert.notEqual(seedNe, seedSw);
  });

  it("does not apply the kasure filter to silk_ribbon streamlines", () => {
    const lines: SimulationStreamline[] = [
      {
        id: "silk-a",
        material: "silk_ribbon",
        speedMps: 0.5,
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 1 },
        ],
      },
      {
        id: "ink-b",
        material: "sumi_ink",
        speedMps: 0.4,
        points: [
          { x: 0, y: 3 },
          { x: 5, y: 3 },
        ],
      },
    ];
    const field = withStreamlines(baseField(), lines);
    const svg = renderWindSketchSvg(getPlanGeometry(field.templateId), field);

    const silkPathMatch = svg.match(/<path[^>]*data-streamline-id="silk-a"[^>]*\/>/);
    const inkPathMatch = svg.match(/<path[^>]*data-streamline-id="ink-b"[^>]*\/>/);
    assert.ok(silkPathMatch, "silk_ribbon path should be present");
    assert.ok(inkPathMatch, "sumi_ink path should be present");
    assert.doesNotMatch(silkPathMatch[0], /sumi-kasure/);
    assert.match(inkPathMatch[0], /url\(#sumi-kasure\)/);
  });

  it("includes the washi paper-fiber multiply overlay using the card token", () => {
    const field = baseField();
    const svg = renderWindSketchSvg(getPlanGeometry(field.templateId), field);
    assert.match(svg, /<pattern[^>]+id="washi-fiber"/);
    assert.match(svg, /mix-blend-mode: multiply/);
    assert.match(svg, /#EFE9DC/);
  });
});
