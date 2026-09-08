import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getPlanGeometry } from "@/server/geometry/registry";
import { buildRecommendationProof } from "./proof";

describe("Recommendation proof", () => {
  it("builds deterministic airflow and placement proof without generated geometry", () => {
    const plan = getPlanGeometry("resale-exec-1990s");
    const proof = buildRecommendationProof({ plan, compassDeg: 255, floor: 11 });

    assert.equal(proof.source.geometry, "plan-geometry.json");
    assert.equal(proof.source.airflow, "deterministic-tier4-field");
    assert.equal(proof.source.lifeSketch, "accepted-gpt-image-2-prebake-or-deterministic-fallback");
    assert.ok(proof.streamlines.length > 0);
    assert.ok(proof.particles.length > 0);
    assert.ok(proof.actions.length > 0);
    assert.ok(proof.actions.length <= 3);
    assert.equal(proof.actions[0].tokenId, "shaft_buffer");
    assert.equal(proof.actions[0].roomLabel, "Master Bath");
    assert.match(proof.actions[0].copy, /0\.6m/);
    assert.equal(proof.actions[1].tokenId, "fan_anchor");
    assert.equal(proof.actions[1].object, "Quiet standing fan");
    assert.ok(proof.acceptedPlacements.some((placement) => placement.tokenId === "shaft_buffer"));
    assert.ok(proof.changelog.includes("Shaft Buffer placed near the pipeshaft path"));
    assert.ok(proof.changelog.includes("physical airflow and humidity effects not assessed"));
    for (const action of proof.actions) {
      assert.doesNotMatch(action.proof, /[+-]?\d+%|Damp Risk moves|band stays unchanged/i);
      if (action.tokenId !== "anti_cure") assert.match(action.proof, /not been assessed/i);
    }
  });

  it("keeps the anti-cure as a keep-clear recommendation", () => {
    const plan = getPlanGeometry("tampines-greenweave");
    const proof = buildRecommendationProof({ plan, compassDeg: 45, floor: 11 });
    const antiCure = proof.actions.find((action) => action.tokenId === "anti_cure");

    assert.ok(antiCure);
    assert.equal(antiCure.kind, "keep_clear");
    assert.equal(antiCure.object, "No built-in furniture");
  });
});
