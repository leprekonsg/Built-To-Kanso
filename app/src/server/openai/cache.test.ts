import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { getCached, keyFor, putCached } from "./cache";

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

  it("keyFor differs by promptKind, image hashes, and seed", () => {
    const base = keyFor("plan-sketch-style-transfer", { imageHashes: ["aa"], seed: "1" });
    const otherKind = keyFor("life-sketch-from-anchor", { imageHashes: ["aa"], seed: "1" });
    const otherImage = keyFor("plan-sketch-style-transfer", { imageHashes: ["bb"], seed: "1" });
    const otherSeed = keyFor("plan-sketch-style-transfer", { imageHashes: ["aa"], seed: "2" });
    assert.notEqual(base, otherKind);
    assert.notEqual(base, otherImage);
    assert.notEqual(base, otherSeed);
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
});
