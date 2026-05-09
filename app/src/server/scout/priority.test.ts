// Unit tests for rankAskingPoints. Uses Node's built-in test runner
// (node:test, available in Node >=18). Run with:
//   node --experimental-strip-types --test src/server/scout/priority.test.ts

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { rankAskingPoints } from "./priority";
import type { AskingPoint } from "./scout";

function ap(id: string, scout: AskingPoint["scout"] = "breath"): AskingPoint {
  return {
    id,
    scout,
    copy: id,
    designerDetail: id,
    tier: "heuristic_estimate",
  };
}

describe("rankAskingPoints", () => {
  it("orders by deterministic priority (black-state, damp, bathroom, west, opening, pipeshaft-drift)", () => {
    const input: AskingPoint[] = [
      ap("breath-opening-marginal"),
      ap("breath-pipeshaft-drift"),
      ap("damp-bedroom-1", "damp"),
      ap("glow-west-edge", "glow"),
      ap("bathroom-downwind-bath-1-bedroom-2"),
      ap("breath-pipeshaft-fixed-jet"),
    ];
    const ranked = rankAskingPoints(input);
    assert.deepEqual(
      ranked.map((p) => p.id),
      [
        "breath-pipeshaft-fixed-jet",       // 1. black-state
        "damp-bedroom-1",                    // 2. damp high
        "bathroom-downwind-bath-1-bedroom-2",// 3. bathroom-downwind
        "glow-west-edge",                    // 4. west-sun
        "breath-opening-marginal",           // 5. opening marginal
        "breath-pipeshaft-drift",            // 6. pipeshaft drift
      ],
    );
  });

  it("matches the breath-bathroom-downwind id-prefix variant", () => {
    const input: AskingPoint[] = [
      ap("breath-opening-marginal"),
      ap("breath-bathroom-downwind-master-1"),
    ];
    const ranked = rankAskingPoints(input);
    assert.equal(ranked[0].id, "breath-bathroom-downwind-master-1");
    assert.equal(ranked[1].id, "breath-opening-marginal");
  });

  it("preserves insertion order on ties", () => {
    const input: AskingPoint[] = [
      ap("damp-bedroom-1", "damp"),
      ap("damp-bedroom-2", "damp"),
      ap("damp-bedroom-3", "damp"),
    ];
    const ranked = rankAskingPoints(input);
    assert.deepEqual(
      ranked.map((p) => p.id),
      ["damp-bedroom-1", "damp-bedroom-2", "damp-bedroom-3"],
    );
  });

  it("does not mutate the input array", () => {
    const input: AskingPoint[] = [
      ap("breath-opening-marginal"),
      ap("damp-bedroom-1", "damp"),
    ];
    const snapshot = input.map((p) => p.id);
    rankAskingPoints(input);
    assert.deepEqual(input.map((p) => p.id), snapshot);
  });

  it("places unknown ids at the end while keeping known ranks ordered", () => {
    const input: AskingPoint[] = [
      ap("unknown-future-rule"),
      ap("breath-opening-marginal"),
      ap("damp-bedroom-1", "damp"),
    ];
    const ranked = rankAskingPoints(input);
    assert.deepEqual(
      ranked.map((p) => p.id),
      ["damp-bedroom-1", "breath-opening-marginal", "unknown-future-rule"],
    );
  });

  it("returns an empty array unchanged", () => {
    assert.deepEqual(rankAskingPoints([]), []);
  });
});
