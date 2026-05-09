import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getPlanGeometry } from "@/server/geometry/registry";
import { evaluateGlow } from "./glow";
import { buildGlowWashPolygons } from "./glowRender";

describe("buildGlowWashPolygons", () => {
  it("materializes the west-sun heat path through exposed windows", () => {
    const plan = getPlanGeometry("tampines-greenweave");
    const glow = evaluateGlow({ plan, compassDeg: plan.westSunFacadeDeg, floor: 16 });
    const polygons = buildGlowWashPolygons(plan, glow);

    assert.ok(polygons.length > 0);
    assert.ok(polygons.every((polygon) => polygon.points.length === 4));
    assert.ok(polygons.every((polygon) => polygon.opacity > 0.08));
  });

  it("does not draw a material wash when there is no west-sun ask", () => {
    const plan = getPlanGeometry("tampines-greenweave");
    const glow = evaluateGlow({ plan, compassDeg: (plan.westSunFacadeDeg + 180) % 360, floor: 8 });

    assert.deepEqual(buildGlowWashPolygons(plan, glow), []);
  });
});
