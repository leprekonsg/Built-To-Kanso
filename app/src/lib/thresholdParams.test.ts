import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseThresholdParams, SCENARIO_IDS } from "./thresholdParams";

describe("parseThresholdParams", () => {
  it("returns nulls and no issues when every input is absent", () => {
    const result = parseThresholdParams({});
    assert.equal(result.templateId, null);
    assert.equal(result.compassDeg, null);
    assert.equal(result.floor, null);
    assert.equal(result.scenarioId, null);
    assert.deepEqual(result.issues, []);
  });

  it("parses a fully valid Threshold reading without issues", () => {
    const result = parseThresholdParams({
      template: "tampines-greenweave",
      compass: "120",
      floor: "11",
      scenario: "mid-renovation",
    });
    assert.equal(result.templateId, "tampines-greenweave");
    assert.equal(result.compassDeg, 120);
    assert.equal(result.floor, 11);
    assert.equal(result.scenarioId, "mid-renovation");
    assert.deepEqual(result.issues, []);
  });

  it("flags scenario in underscore form with the valid list", () => {
    const result = parseThresholdParams({
      template: "tampines-greenweave",
      compass: "120",
      floor: "11",
      scenario: "mid_renovation",
    });
    assert.equal(result.scenarioId, null);
    assert.equal(result.issues.length, 1);
    assert.equal(result.issues[0].field, "scenario");
    assert.equal(result.issues[0].raw, "mid_renovation");
    for (const id of SCENARIO_IDS) {
      assert.ok(result.issues[0].reason.includes(id), `reason should name valid scenario ${id}`);
    }
  });

  it("flags unknown templates and names the valid set", () => {
    const result = parseThresholdParams({ template: "not-a-template" });
    assert.equal(result.templateId, null);
    assert.equal(result.issues[0].field, "template");
    assert.ok(result.issues[0].reason.includes("tampines-greenweave"));
  });

  it("rejects out-of-range floor instead of silently clamping", () => {
    const high = parseThresholdParams({ floor: "99" });
    assert.equal(high.floor, null);
    assert.equal(high.issues[0].field, "floor");
    assert.ok(/range/i.test(high.issues[0].reason));

    const low = parseThresholdParams({ floor: "0" });
    assert.equal(low.floor, null);
    assert.equal(low.issues[0].field, "floor");
  });

  it("flags non-numeric floor with the valid bounds", () => {
    const result = parseThresholdParams({ floor: "ground" });
    assert.equal(result.floor, null);
    assert.equal(result.issues[0].field, "floor");
    assert.ok(/1-50/.test(result.issues[0].reason));
  });

  it("flags non-numeric compass but keeps circular wrap for numeric values", () => {
    const bad = parseThresholdParams({ compass: "east" });
    assert.equal(bad.compassDeg, null);
    assert.equal(bad.issues[0].field, "compass");

    const wrap = parseThresholdParams({ compass: "390" });
    // 390° → snaps to 390 (already on 15° grid) → 390 % 360 = 30
    assert.equal(wrap.compassDeg, 30);
    assert.deepEqual(wrap.issues, []);
  });

  it("collects multiple issues across fields", () => {
    const result = parseThresholdParams({
      template: "wrong",
      compass: "east",
      floor: "100",
      scenario: "mid_renovation",
    });
    const fields = result.issues.map((issue) => issue.field).sort();
    assert.deepEqual(fields, ["compass", "floor", "scenario", "template"]);
  });
});
