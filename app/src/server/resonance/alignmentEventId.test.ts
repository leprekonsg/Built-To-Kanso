import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { computeAlignmentEventId } from "./resonance";

// Brief 14.5 — the alignmentEventId is the in-app banner's dedup key.
// Stable across a 60s poll cadence during the same alignment; changes when
// wind drifts >10deg or the hour bucket rolls over.

describe("computeAlignmentEventId", () => {
  const corridor = 180;
  const t0 = new Date("2026-05-09T06:30:00Z");

  it("returns the same id for two polls 60s apart with stable wind", () => {
    const idA = computeAlignmentEventId(corridor, 178, t0);
    const idB = computeAlignmentEventId(corridor, 178, new Date(t0.getTime() + 60_000));
    assert.equal(idA, idB);
  });

  it("returns the same id for tiny wind direction wobble within a 10deg bucket", () => {
    const idA = computeAlignmentEventId(corridor, 175, t0);
    const idB = computeAlignmentEventId(corridor, 178, t0);
    assert.equal(idA, idB);
  });

  it("returns a different id when wind drifts past the 10deg bucket", () => {
    const idA = computeAlignmentEventId(corridor, 175, t0);
    const idB = computeAlignmentEventId(corridor, 195, t0);
    assert.notEqual(idA, idB);
  });

  it("returns a different id when the hour bucket rolls over", () => {
    const idA = computeAlignmentEventId(corridor, 178, t0);
    const idB = computeAlignmentEventId(corridor, 178, new Date(t0.getTime() + 60 * 60 * 1000));
    assert.notEqual(idA, idB);
  });

  it("normalises angles so 359deg and -1deg share the same bucket", () => {
    const idA = computeAlignmentEventId(0, 359, t0);
    const idB = computeAlignmentEventId(0, -1, t0);
    assert.equal(idA, idB);
  });

  it("returns a 16-char hex string (stable shape for sessionStorage)", () => {
    const id = computeAlignmentEventId(corridor, 180, t0);
    assert.match(id, /^[0-9a-f]{16}$/);
  });
});
