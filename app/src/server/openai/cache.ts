// Content-addressable cache for OpenAI image renders.
//
// As of 2026-05-09 R2 is OUT of Phase 1. The runtime cache is a per-process
// in-memory LRU keyed on a sha256-prefix hash of (promptKind, model,
// imageHashes, seed). Prebake scripts may opt into the FileSketchCache for build-time
// artifacts, but the route hot path uses memory only.
//
// Sketches are tier "prototype_visualisation" (evidence.ts). Cache hits are
// deterministic and safe to ship without an API key — we only call OpenAI on
// a true cache miss, and we surface the missing-key state clearly to the
// route layer instead of failing open.

import { hashString } from "@/lib/imageHash";
import type { ImagePromptKind } from "@/server/folio/prompts";
import { getOpenAIImageModel, normalizeOpenAIImageModel } from "./client";
import {
  DEFAULT_SKETCH_CACHE_DIR,
  DEFAULT_SKETCH_CACHE_MAX_ENTRIES,
  DEFAULT_SKETCH_CACHE_TTL_MS,
  FileSketchCache,
  MemorySketchCache,
  createSketchCacheFromEnv,
  type SketchCache,
  type SketchCacheConfigResult,
} from "@/server/storage/sketchCache";

export interface CacheKeyInputs {
  imageHashes?: string[];
  model?: string;
  seed?: string;
}

export function keyFor(promptKind: ImagePromptKind, inputs: CacheKeyInputs): string {
  const model = inputs.model ? normalizeOpenAIImageModel(inputs.model) : getOpenAIImageModel();
  const parts = [
    `kind=${promptKind}`,
    `model=${model}`,
    `images=${(inputs.imageHashes ?? []).join(",")}`,
    `seed=${inputs.seed ?? ""}`,
  ];
  return hashString(parts.join("|"));
}

// File-cache helpers retained for build-time scripts that want to persist
// prebaked PNG artifacts to disk. The runtime route handlers use the
// in-memory cache via getConfiguredSketchCache.
export async function getCached(key: string, dir: string = DEFAULT_SKETCH_CACHE_DIR): Promise<Buffer | null> {
  return new FileSketchCache(dir).get(key);
}

export async function putCached(key: string, bytes: Buffer, dir: string = DEFAULT_SKETCH_CACHE_DIR): Promise<void> {
  await new FileSketchCache(dir).put(key, bytes);
}

export function getConfiguredSketchCache(): SketchCacheConfigResult {
  return createSketchCacheFromEnv();
}

export type { SketchCache };

export {
  DEFAULT_SKETCH_CACHE_DIR,
  DEFAULT_SKETCH_CACHE_MAX_ENTRIES,
  DEFAULT_SKETCH_CACHE_TTL_MS,
  MemorySketchCache,
};
