import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  MemorySketchCache,
  __resetSketchCacheForTests,
  createSketchCacheFromEnv,
} from "./sketchCache";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "btk-sketch-cache-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("sketch cache storage", () => {
  it("defaults to an in-memory cache and round-trips hit/miss", async () => {
    __resetSketchCacheForTests();
    const result = createSketchCacheFromEnv({});
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.kind, "memory");
    assert.equal(await result.cache.get("missing"), null);

    const bytes = Buffer.from("png-bytes");
    await result.cache.put("abc123", bytes);
    const cached = await result.cache.get("abc123");
    assert.ok(cached);
    assert.equal(Buffer.compare(cached, bytes), 0);
  });

  it("supports a file-backed cache for prebake artifacts", async () => {
    await withTempDir(async (dir) => {
      const result = createSketchCacheFromEnv({
        SKETCH_CACHE_PROVIDER: "file",
        SKETCH_CACHE_DIR: dir,
      });
      assert.equal(result.ok, true);
      if (!result.ok) return;

      assert.equal(result.kind, "file");
      assert.equal(await result.cache.get("missing"), null);

      const bytes = Buffer.from("png-bytes");
      await result.cache.put("abc123", bytes);
      const cached = await result.cache.get("abc123");
      assert.ok(cached);
      assert.equal(Buffer.compare(cached, bytes), 0);
    });
  });

  it("rejects retired R2 provider with an actionable message", () => {
    __resetSketchCacheForTests();
    const result = createSketchCacheFromEnv({ SKETCH_CACHE_PROVIDER: "r2" });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "cache_env_error");
    assert.match(result.message, /memory, file/);
    assert.match(result.message, /R2 is out/i);
  });

  it("MemorySketchCache evicts the oldest entry when over capacity", async () => {
    const cache = new MemorySketchCache(2, 60_000);
    await cache.put("a", Buffer.from("1"));
    await cache.put("b", Buffer.from("2"));
    await cache.put("c", Buffer.from("3"));
    assert.equal(await cache.get("a"), null);
    assert.equal((await cache.get("b"))?.toString(), "2");
    assert.equal((await cache.get("c"))?.toString(), "3");
  });

  it("MemorySketchCache expires entries after TTL", async () => {
    const cache = new MemorySketchCache(8, 5);
    await cache.put("k", Buffer.from("v"));
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(await cache.get("k"), null);
  });
});
