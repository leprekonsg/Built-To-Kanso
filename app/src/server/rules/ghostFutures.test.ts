import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getPlanGeometry } from "@/server/geometry/registry";
import { previewGhostFuture, previewGhostFutures } from "./ghostFutures";

describe("Ghost Futures evidence boundaries", () => {
  const plan = getPlanGeometry("resale-exec-1990s");

  it("describes token changes as illustrations without numerical benefits", () => {
    const future = previewGhostFuture({
      plan,
      compassDeg: 260,
      floor: 11,
      placements: [],
      candidate: { tokenId: "shaft_buffer", point: plan.pipeshaft!.openingPoint },
    });

    assert.equal(future.allowed, true);
    assert.equal(future.dampBandCopy, "Humidity effect: Not assessed.");
    assert.match(future.preview, /illustrated path/i);
    assert.match(future.preview, /have not been assessed/i);
    assert.doesNotMatch(JSON.stringify(future), /estimatedChangePct|[+-]?\d+%|Damp Risk moves|band stays unchanged/i);
  });

  it("uses Not assessed for the current baseline instead of a reassuring default", () => {
    const futures = previewGhostFutures({ plan, compassDeg: 260, floor: 11, placements: [] });
    const current = futures.find((future) => future.role === "current");

    assert.ok(current);
    assert.match(current.preview, /Not assessed/);
    assert.equal(current.dampBandCopy, "Humidity effect: Not assessed.");
    assert.doesNotMatch(current.preview, /holds|unchanged|clear|watch|high/i);
  });
});
