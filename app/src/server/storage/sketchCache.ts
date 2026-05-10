// Sketch cache storage.
//
// As of 2026-05-09, R2 is OUT of Phase 1. Runtime caching is in-memory only:
// a per-process LRU keyed on a content-addressable hash of (promptKind,
// imageHashes, seed). The on-disk FileSketchCache is retained because the
// prebake scripts (Empty Room hero, Three.js anchors) write artifacts to
// `<cwd>/public/...`, including `public/life-anchors/...`, which the route
// layer reads directly. The runtime cache itself is memory-only.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface SketchCache {
  get(key: string): Promise<Buffer | null>;
  put(key: string, bytes: Buffer): Promise<void>;
}

export type SketchCacheKind = "file" | "memory";

export type SketchCacheConfigResult =
  | { ok: true; kind: SketchCacheKind; cache: SketchCache }
  | { ok: false; reason: "cache_env_error"; message: string };

export interface SketchCacheEnv {
  [key: string]: string | undefined;
  SKETCH_CACHE_PROVIDER?: string;
  SKETCH_CACHE_DIR?: string;
  SKETCH_CACHE_MAX_ENTRIES?: string;
  SKETCH_CACHE_TTL_MS?: string;
}

export const DEFAULT_SKETCH_CACHE_DIR = resolve(process.cwd(), ".cache", "sketches");

// 30 minutes. Sketches are tier "prototype_visualisation" and the same prompt
// + reference hash should yield byte-identical output, so a long TTL is fine.
// We re-derive on miss anyway, and the LRU caps memory.
export const DEFAULT_SKETCH_CACHE_TTL_MS = 30 * 60 * 1000;

// 64 entries at ~1 MB/PNG worst case is ~64 MB, comfortably below a Next.js
// route's reasonable memory budget.
export const DEFAULT_SKETCH_CACHE_MAX_ENTRIES = 64;

export class FileSketchCache implements SketchCache {
  constructor(private readonly dir: string = DEFAULT_SKETCH_CACHE_DIR) {}

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(cachePath(this.dir, key));
    } catch {
      return null;
    }
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(cachePath(this.dir, key), bytes);
  }
}

interface MemoryEntry {
  bytes: Buffer;
  expiresAt: number;
}

// Simple LRU with TTL. Map iteration order is insertion order, so we re-insert
// on touch to bump recency, and evict the oldest entry when over capacity.
export class MemorySketchCache implements SketchCache {
  private readonly values = new Map<string, MemoryEntry>();

  constructor(
    private readonly maxEntries: number = DEFAULT_SKETCH_CACHE_MAX_ENTRIES,
    private readonly ttlMs: number = DEFAULT_SKETCH_CACHE_TTL_MS,
  ) {}

  async get(key: string): Promise<Buffer | null> {
    const entry = this.values.get(key);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
      this.values.delete(key);
      return null;
    }
    // Bump recency.
    this.values.delete(key);
    this.values.set(key, entry);
    return Buffer.from(entry.bytes);
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    if (this.values.has(key)) this.values.delete(key);
    this.values.set(key, {
      bytes: Buffer.from(bytes),
      expiresAt: Date.now() + this.ttlMs,
    });
    while (this.values.size > this.maxEntries) {
      const oldest = this.values.keys().next().value;
      if (oldest === undefined) break;
      this.values.delete(oldest);
    }
  }

  // Test-only: snapshot size without exposing internals.
  size(): number {
    return this.values.size;
  }
}

// Process-wide singleton so one-shot route handlers share a cache across
// requests within the same Node process. Next.js runs the route on demand;
// the module is held by the Node module graph so this Map persists across
// invocations of the same instance.
let SINGLETON_MEMORY_CACHE: MemorySketchCache | null = null;

function getMemorySingleton(env: SketchCacheEnv): MemorySketchCache {
  if (SINGLETON_MEMORY_CACHE) return SINGLETON_MEMORY_CACHE;
  const max = parsePositiveInt(env.SKETCH_CACHE_MAX_ENTRIES, DEFAULT_SKETCH_CACHE_MAX_ENTRIES);
  const ttl = parsePositiveInt(env.SKETCH_CACHE_TTL_MS, DEFAULT_SKETCH_CACHE_TTL_MS);
  SINGLETON_MEMORY_CACHE = new MemorySketchCache(max, ttl);
  return SINGLETON_MEMORY_CACHE;
}

// Test-only: drop the singleton so unit tests stay isolated.
export function __resetSketchCacheForTests(): void {
  SINGLETON_MEMORY_CACHE = null;
}

export function createSketchCacheFromEnv(env: SketchCacheEnv = process.env): SketchCacheConfigResult {
  const provider = (env.SKETCH_CACHE_PROVIDER ?? "memory").toLowerCase();
  if (provider === "memory") {
    return { ok: true, kind: "memory", cache: getMemorySingleton(env) };
  }
  if (provider === "file" || provider === "local") {
    return {
      ok: true,
      kind: "file",
      cache: new FileSketchCache(env.SKETCH_CACHE_DIR ?? DEFAULT_SKETCH_CACHE_DIR),
    };
  }
  return {
    ok: false,
    reason: "cache_env_error",
    message: "SKETCH_CACHE_PROVIDER must be one of: memory, file. R2 is out of Phase 1 as of 2026-05-09.",
  };
}

function cachePath(dir: string, key: string): string {
  return join(dir, `${safeKey(key)}.png`);
}

function safeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}
