import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getPlanGeometry } from "@/server/geometry/registry";
import { runScoutPass } from "./scout";

describe("Scout damp evidence boundary", () => {
  it("does not infer bedroom humidity from token placement", () => {
    const plan = getPlanGeometry("resale-exec-1990s");
    const withoutToken = runScoutPass({ plan, compassDeg: 260, floor: 11, tokenPlacements: [] });
    const withToken = runScoutPass({
      plan,
      compassDeg: 260,
      floor: 11,
      tokenPlacements: [{ tokenId: "shaft_buffer", point: plan.pipeshaft!.openingPoint }],
    });

    assert.deepEqual(withToken.dampRisk, withoutToken.dampRisk);
    assert.ok(withToken.dampRisk.length > 0);
    for (const reading of withToken.dampRisk) {
      assert.equal(reading.band, "not_assessed");
      assert.match(reading.recommendation, /Humidity effect: Not assessed/);
    }
    assert.doesNotMatch(JSON.stringify(withToken.dampRisk), /predictedRhPct|thresholdPct|\b(75|78)%?\b/);
  });

  it("does not treat unit facing as outdoor wind direction", () => {
    const plan = getPlanGeometry("resale-exec-1990s");
    const withoutWind = runScoutPass({
      plan,
      compassDeg: 315,
      floor: 11,
      tokenPlacements: [],
    });
    const withObservedWind = runScoutPass({
      plan,
      compassDeg: 315,
      windFromDeg: 315,
      floor: 11,
      tokenPlacements: [],
    });

    assert.equal(
      withoutWind.askingPoints.some((point) => point.id.startsWith("bathroom-downwind-")),
      false,
    );
    assert.equal(
      withObservedWind.askingPoints.some((point) => point.id.startsWith("bathroom-downwind-")),
      true,
    );
  });
});
