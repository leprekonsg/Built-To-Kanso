import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coherentShaftlessPlan } from "@/server/geometry/testFixtures";
import { computeCrossVentCorridor } from "./corridor";

describe("computeCrossVentCorridor", () => {
  it("requires exterior openings connected by the active interior opening graph", () => {
    const plan = coherentShaftlessPlan();
    assert.ok(computeCrossVentCorridor(plan));
    plan.openings.find((opening) => opening.id === "living-bath")!.operable = false;
    assert.equal(computeCrossVentCorridor(plan), null);
  });

  it("does not treat internal openings as exterior endpoints", () => {
    const plan = coherentShaftlessPlan();
    plan.openings = plan.openings.filter((opening) => opening.roomIds.length === 2);
    assert.equal(computeCrossVentCorridor(plan), null);
  });

  it("keeps its physical axis unchanged when identifiers and array order change", () => {
    const plan = coherentShaftlessPlan();
    const original = computeCrossVentCorridor(plan);
    assert.ok(original);
    plan.openings[0].id = "zzz";
    plan.openings[2].id = "aaa";
    plan.rooms[0].id = "room-z";
    plan.rooms[1].id = "room-a";
    plan.openings[0].roomIds = ["room-z"];
    plan.openings[1].roomIds = ["room-z", "room-a"];
    plan.openings[2].roomIds = ["room-a"];
    plan.openings.reverse();
    const renamed = computeCrossVentCorridor(plan);
    assert.ok(renamed);
    assert.equal(renamed.azimuthDeg, original.azimuthDeg);
    assert.equal(renamed.spanM, original.spanM);
  });

  it("reports an undirected axis rather than deriving inlet direction from ids", () => {
    const plan = coherentShaftlessPlan();
    const corridor = computeCrossVentCorridor(plan);
    assert.ok(corridor);
    assert.equal(corridor.azimuthDeg, 90);
    assert.ok(corridor.azimuthDeg >= 0 && corridor.azimuthDeg < 180);
  });
});
