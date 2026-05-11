import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { getCached, getCachedMetadata, keyFor, putCached, putCachedMetadata } from "./cache";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "btk-cache-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("openai cache", () => {
  it("keyFor is deterministic for identical inputs", () => {
    const a = keyFor("plan-sketch-style-transfer", { imageHashes: ["aabb", "ccdd"], seed: "x" });
    const b = keyFor("plan-sketch-style-transfer", { imageHashes: ["aabb", "ccdd"], seed: "x" });
    assert.equal(a, b);
    assert.match(a, /^[0-9a-f]{16}$/);
  });

  it("keyFor differs by promptKind, model, prompt hash, image hashes, seed, and QA gate version", () => {
    const base = keyFor("plan-sketch-style-transfer", { imageHashes: ["aa"], model: "gpt-image-2", promptHash: "p1", seed: "1" });
    const otherModel = keyFor("plan-sketch-style-transfer", { imageHashes: ["aa"], model: "chatgpt-image-latest", promptHash: "p1", seed: "1" });
    const otherKind = keyFor("life-sketch-from-anchor", { imageHashes: ["aa"], promptHash: "p1", seed: "1" });
    const otherPrompt = keyFor("plan-sketch-style-transfer", { imageHashes: ["aa"], promptHash: "p2", seed: "1" });
    const otherImage = keyFor("plan-sketch-style-transfer", { imageHashes: ["bb"], promptHash: "p1", seed: "1" });
    const otherSeed = keyFor("plan-sketch-style-transfer", { imageHashes: ["aa"], promptHash: "p1", seed: "2" });
    const otherQa = keyFor("plan-sketch-style-transfer", { imageHashes: ["aa"], model: "gpt-image-2", promptHash: "p1", seed: "1", qaGateVersion: "v2" });
    assert.notEqual(base, otherModel);
    assert.notEqual(base, otherKind);
    assert.notEqual(base, otherPrompt);
    assert.notEqual(base, otherImage);
    assert.notEqual(base, otherSeed);
    assert.notEqual(base, otherQa);
  });

  it("round-trips put then get", async () => {
    await withTempDir(async (dir) => {
      const key = keyFor("empty-room-hero", { seed: "kanso-empty-bone" });
      const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      assert.equal(await getCached(key, dir), null);
      await putCached(key, bytes, dir);
      const out = await getCached(key, dir);
      assert.ok(out);
      assert.equal(Buffer.compare(out, bytes), 0);
      const files = await readdir(dir);
      assert.deepEqual(files, [`${key}.png`]);
    });
  });

  it("missing key returns null without throwing", async () => {
    await withTempDir(async (dir) => {
      const out = await getCached("nonexistent_key_xyz", dir);
      assert.equal(out, null);
    });
  });

  it("stores candidate QA metadata beside accepted cached output", async () => {
    await withTempDir(async (dir) => {
      const previousProvider = process.env.SKETCH_CACHE_PROVIDER;
      const previousDir = process.env.SKETCH_CACHE_DIR;
      process.env.SKETCH_CACHE_PROVIDER = "file";
      process.env.SKETCH_CACHE_DIR = dir;
      try {
        const key = keyFor("life-sketch-from-anchor", { imageHashes: ["anchor", "topology"] });
        await putCachedMetadata({
          key,
          promptKind: "life-sketch-from-anchor",
          candidateCount: 3,
          acceptedCandidateIndex: 0,
          rejectedCandidates: [
            { candidateIndex: 1, reason: "window_side_drift" },
            { candidateIndex: 2, reason: "hs_pipeshaft_relation_drift" },
          ],
          acceptedAtIso: "2026-05-10T00:00:00.000Z",
          reviewerModel: "gpt-4.1-mini",
          reviewerSummary: "candidate_0_preserves_locked_topology",
        }, dir);

        assert.deepEqual((await getCachedMetadata(key, dir))?.rejectedCandidates, [
          { candidateIndex: 1, reason: "window_side_drift" },
          { candidateIndex: 2, reason: "hs_pipeshaft_relation_drift" },
        ]);

        const files = await readdir(dir);
        assert.deepEqual(files, [`${key}.json`]);
      } finally {
        if (previousProvider === undefined) delete process.env.SKETCH_CACHE_PROVIDER;
        else process.env.SKETCH_CACHE_PROVIDER = previousProvider;
        if (previousDir === undefined) delete process.env.SKETCH_CACHE_DIR;
        else process.env.SKETCH_CACHE_DIR = previousDir;
      }
    });
  });
});
