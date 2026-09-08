import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildLifeAnchorSceneManifest, createLifeAnchorThreeScene } from "@/server/anchors/lifeAnchor";
import { buildRecommendationProof } from "@/server/recommendations/proof";
import { previewGhostFuture, previewGhostFutures } from "@/server/rules/ghostFutures";
import { validateTokenPlacement, TOKEN_IDS } from "@/server/rules/tokens";
import { runScoutPass } from "@/server/scout/scout";
import { getPlanGeometry } from "./registry";

describe("missing pipeshaft capability", () => {
  it("disables shaft-specific advice and visuals without inventing geometry", () => {
    const plan = structuredClone(getPlanGeometry("resale-exec-1990s"));
    plan.pipeshaft = null;
    plan.fixedElements = plan.fixedElements.filter((element) => element.kind !== "pipeshaft_opening");

    const placement = { tokenId: "shaft_buffer" as const, point: { x: 1, y: 1 } };
    const token = validateTokenPlacement(plan, placement);
    assert.equal(token.allowed, false);
    assert.equal(token.code, "shaft_unavailable");

    const scout = runScoutPass({ plan, compassDeg: 260, floor: 11, tokenPlacements: [placement] });
    assert.doesNotMatch(JSON.stringify(scout), /pipeshaft drift/i);

    const future = previewGhostFuture({ plan, compassDeg: 260, floor: 11, placements: [], candidate: placement });
    assert.equal(future.code, "shaft_unavailable");
    assert.ok(previewGhostFutures({ plan, compassDeg: 260, floor: 11, placements: [] }).every((item) => item.tokenId !== "shaft_buffer"));
    const exhausted = previewGhostFutures({ plan, compassDeg: 260, floor: 11,
      placements: TOKEN_IDS.filter((id) => id !== "shaft_buffer").map((tokenId) => ({ tokenId, point: { x: 1, y: 1 } })),
    });
    assert.equal(exhausted.length, 1);
    assert.equal(exhausted[0].role, "current");

    const proof = buildRecommendationProof({ plan, compassDeg: 260, floor: 11 });
    assert.ok(proof.actions.every((action) => action.tokenId !== "shaft_buffer"));
    assert.ok(proof.acceptedPlacements.every((item) => item.tokenId !== "shaft_buffer"));
    assert.ok(proof.particles.every((particle) => particle.kind !== "pipeshaft_drift"));
    assert.ok(proof.streamlines.every((line) => !line.id.includes("shaft")));

    const scene = createLifeAnchorThreeScene(plan).scene;
    assert.equal(scene.children.some((child) => child.name.startsWith("pipeshaft:")), false);
    assert.equal(buildLifeAnchorSceneManifest(plan).fixedElements.some((element) => element.kind === "pipeshaft_opening"), false);
  });
});
