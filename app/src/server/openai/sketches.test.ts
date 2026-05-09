import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashBytes } from "@/lib/imageHash";
import { keyFor } from "./cache";

// generateLifeSketch hashes (anchorPng, brand?, japandi?) into the cache key
// in that order. We re-derive the key here to confirm any change to the
// reference bundle invalidates a previously stored entry.
function lifeKey(anchor: Buffer, brand?: Buffer, japandi?: Buffer): string {
  const hashes = [hashBytes(anchor)];
  if (brand) hashes.push(hashBytes(brand));
  if (japandi) hashes.push(hashBytes(japandi));
  return keyFor("life-sketch-from-anchor", { imageHashes: hashes });
}

describe("Life Sketch reference bundle cache key", () => {
  const anchor = Buffer.from("anchor-png-stand-in", "utf8");
  const brandA = Buffer.from("brand-v3-stand-in-a", "utf8");
  const brandB = Buffer.from("brand-v3-stand-in-b", "utf8");
  const japandi = Buffer.from("japandi-board-stand-in", "utf8");

  it("anchor-only key is stable across calls", () => {
    assert.equal(lifeKey(anchor), lifeKey(anchor));
  });

  it("adding a brand reference changes the key", () => {
    const baseline = lifeKey(anchor);
    const withBrand = lifeKey(anchor, brandA);
    assert.notEqual(baseline, withBrand);
  });

  it("changing the brand reference changes the key", () => {
    const a = lifeKey(anchor, brandA);
    const b = lifeKey(anchor, brandB);
    assert.notEqual(a, b);
  });

  it("changing the japandi reference changes the key (brand fixed)", () => {
    const a = lifeKey(anchor, brandA, japandi);
    const b = lifeKey(anchor, brandA, Buffer.from("japandi-other", "utf8"));
    assert.notEqual(a, b);
  });

  it("anchor-only key differs from full-bundle key", () => {
    const a = lifeKey(anchor);
    const b = lifeKey(anchor, brandA, japandi);
    assert.notEqual(a, b);
  });
});
