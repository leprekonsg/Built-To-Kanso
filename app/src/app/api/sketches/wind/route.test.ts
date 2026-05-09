import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPolishRequested } from "./route";

describe("Wind Sketch polish opt-in", () => {
  it("treats ?polish=1 as opt-in", () => {
    const params = new URL("https://example.com/api/sketches/wind?polish=1").searchParams;
    assert.equal(isPolishRequested(params), true);
  });

  it("treats absent polish param as off", () => {
    const params = new URL("https://example.com/api/sketches/wind").searchParams;
    assert.equal(isPolishRequested(params), false);
  });

  it("treats polish=0 as off", () => {
    const params = new URL("https://example.com/api/sketches/wind?polish=0").searchParams;
    assert.equal(isPolishRequested(params), false);
  });

  it("treats polish=true as off (strict 1-only)", () => {
    const params = new URL("https://example.com/api/sketches/wind?polish=true").searchParams;
    assert.equal(isPolishRequested(params), false);
  });
});
