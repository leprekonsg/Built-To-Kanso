import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getPlanGeometry } from "@/server/geometry/registry";
import { extractStreamlinePoints } from "@/server/lbm/streamlines";
import type { VelocityField } from "@/server/lbm/types";
import { buildStreamlines, composeExtractedStreamlines, WEATHER_TRIALS } from "./fieldBuilders";

function movingField(size = 32): VelocityField {
  const data = new Float32Array(size * size * 2);
  for (let index = 0; index < size * size; index += 1) data[index * 2] = 0.05;
  return { width: size, height: size, data } as unknown as VelocityField;
}

describe("Tier 1 streamline provenance", () => {
  it("never classifies an ordinary line as shaft-originated when the shaft is absent", () => {
    const plan = { ...getPlanGeometry("tengah-5room"), pipeshaft: null };
    const lines = buildStreamlines(movingField(), plan, WEATHER_TRIALS.ne_monsoon);
    assert.ok(lines.length > 0);
    assert.ok(lines.every((line) => !line.id.startsWith("pipeshaft-drift") && line.material === "silk_ribbon"));
  });

  it("keeps seed semantics when extraction order changes", () => {
    const plan = getPlanGeometry("tengah-5room");
    const field = movingField();
    const extracted = extractStreamlinePoints(field, plan, {
      count: 6, compassDeg: 45, includePipeshaftSource: true,
    });
    const shaft = extracted.find((line) => line.source.kind === "pipeshaft");
    assert.ok(shaft);
    const shaftFirst = [shaft, ...extracted.filter((line) => line.source.kind !== "pipeshaft").reverse()];
    const lines = composeExtractedStreamlines(field, plan, WEATHER_TRIALS.ne_monsoon, shaftFirst);

    assert.equal(lines[0].source?.kind, "pipeshaft");
    assert.equal(lines[0].id, "pipeshaft-drift");
    assert.equal(lines[0].material, "sumi_ink");
    assert.ok(lines.slice(1).every((line) => !line.id.startsWith("pipeshaft-drift") && line.material === "silk_ribbon"));
  });

  it("emits a shaft label only from a specifically modelled shaft seed", () => {
    const plan = getPlanGeometry("tengah-5room");
    const extracted = extractStreamlinePoints(movingField(), plan, {
      count: 6,
      compassDeg: 45,
      includePipeshaftSource: true,
    });
    assert.equal(extracted.filter((line) => line.source.kind === "pipeshaft").length, 1);

    const composed = buildStreamlines(movingField(), plan, WEATHER_TRIALS.ne_monsoon);
    assert.equal(composed.filter((line) => line.id === "pipeshaft-drift").length, 1);
    assert.equal(composed.find((line) => line.source?.kind === "pipeshaft")?.source?.kind, "pipeshaft");
  });
});
