import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashBytes, hashString } from "@/lib/imageHash";
import { keyFor } from "./cache";

// generateLifeSketch hashes (anchorPng, topology?, brand?, material?) into the cache key
// in that order. We re-derive the key here to confirm any change to the
// reference bundle invalidates a previously stored entry.
function lifeKey(anchor: Buffer, prompt = "life prompt", topology?: Buffer, brand?: Buffer, material?: Buffer): string {
  const hashes = [hashBytes(anchor)];
  if (topology) hashes.push(hashBytes(topology));
  if (brand) hashes.push(hashBytes(brand));
  if (material) hashes.push(hashBytes(material));
  return keyFor("life-sketch-from-anchor", { imageHashes: hashes, promptHash: hashString(prompt) });
}

describe("Life Sketch reference bundle cache key", () => {
  const anchor = Buffer.from("anchor-png-stand-in", "utf8");
  const topology = Buffer.from("topology-plan-stand-in", "utf8");
  const brandA = Buffer.from("brand-v3-stand-in-a", "utf8");
  const brandB = Buffer.from("brand-v3-stand-in-b", "utf8");
  const material = Buffer.from("hdb-material-board-stand-in", "utf8");

  it("anchor-only key is stable across calls", () => {
    assert.equal(lifeKey(anchor), lifeKey(anchor));
  });

  it("adding the topology proof changes the key", () => {
    const baseline = lifeKey(anchor);
    const withTopology = lifeKey(anchor, "life prompt", topology);
    assert.notEqual(baseline, withTopology);
  });

  it("adding a brand reference changes the key", () => {
    const baseline = lifeKey(anchor);
    const withBrand = lifeKey(anchor, "life prompt", topology, brandA);
    assert.notEqual(baseline, withBrand);
  });

  it("changing the brand reference changes the key", () => {
    const a = lifeKey(anchor, "life prompt", topology, brandA);
    const b = lifeKey(anchor, "life prompt", topology, brandB);
    assert.notEqual(a, b);
  });

  it("changing the material reference changes the key (brand fixed)", () => {
    const a = lifeKey(anchor, "life prompt", topology, brandA, material);
    const b = lifeKey(anchor, "life prompt", topology, brandA, Buffer.from("material-other", "utf8"));
    assert.notEqual(a, b);
  });

  it("changing the prompt text changes the key", () => {
    assert.notEqual(lifeKey(anchor, "life prompt"), lifeKey(anchor, "hardened life prompt"));
  });

  it("anchor-only key differs from full-bundle key", () => {
    const a = lifeKey(anchor);
    const b = lifeKey(anchor, "life prompt", topology, brandA, material);
    assert.notEqual(a, b);
  });
});
