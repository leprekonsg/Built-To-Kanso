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

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
  promptHash?: string;
  seed?: string;
  // QA gate version. Bumping this string invalidates every cached PNG that
  // was accepted under an older gate, so the next call re-renders and
  // re-reviews. Use this when changing what the reviewer enforces (e.g.
  // adding a deterministic bathroom-count check) rather than mutating the
  // prompt text alone — prompt mutations also work, but tying invalidation
  // to a named gate version is intentional and reviewable.
  qaGateVersion?: string;
}

export interface SketchCacheMetadata {
  key: string;
  pngHash?: string;
  promptKind: ImagePromptKind;
  candidateCount: number;
  acceptedCandidateIndex: number;
  rejectedCandidates: Array<{ candidateIndex: number; reason: string }>;
  acceptedAtIso: string;
  reviewerModel?: string;
  reviewerSummary?: string;
  candidateReviews?: Array<{
    candidateIndex: number;
    status: "accepted" | "rejected";
    reasons: string[];
    checks: Record<string, string>;
  }>;
}

const METADATA_CACHE = new Map<string, SketchCacheMetadata>();

function usesFileMetadata(): boolean {
  return ["file", "local"].includes((process.env.SKETCH_CACHE_PROVIDER ?? "memory").trim().toLowerCase());
}

export function keyFor(promptKind: ImagePromptKind, inputs: CacheKeyInputs): string {
  const model = inputs.model ? normalizeOpenAIImageModel(inputs.model) : getOpenAIImageModel();
  const parts = [
    `kind=${promptKind}`,
    `model=${model}`,
    `prompt=${inputs.promptHash ?? ""}`,
    `images=${(inputs.imageHashes ?? []).join(",")}`,
    `seed=${inputs.seed ?? ""}`,
    `qa=${inputs.qaGateVersion ?? ""}`,
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

export async function putCachedMetadata(
  metadata: SketchCacheMetadata,
  dir: string = process.env.SKETCH_CACHE_DIR ?? DEFAULT_SKETCH_CACHE_DIR,
): Promise<void> {
  if (!usesFileMetadata()) {
    METADATA_CACHE.delete(metadata.key);
    METADATA_CACHE.set(metadata.key, metadata);
    while (METADATA_CACHE.size > DEFAULT_SKETCH_CACHE_MAX_ENTRIES) {
      METADATA_CACHE.delete(METADATA_CACHE.keys().next().value!);
    }
    return;
  }
  await mkdir(dir, { recursive: true });
  await writeFile(metadataPath(dir, metadata.key), JSON.stringify(metadata, null, 2), "utf8");
}

export async function getCachedMetadata(
  key: string,
  dir: string = process.env.SKETCH_CACHE_DIR ?? DEFAULT_SKETCH_CACHE_DIR,
): Promise<SketchCacheMetadata | undefined> {
  if (!usesFileMetadata()) return METADATA_CACHE.get(key);
  try {
    const raw = await readFile(metadataPath(dir, key), "utf8");
    const metadata = JSON.parse(raw) as SketchCacheMetadata;
    if (metadata?.key !== key) return undefined;
    return metadata;
  } catch {
    return undefined;
  }
}

function metadataPath(dir: string, key: string): string {
  return join(dir, `${safeKey(key)}.json`);
}

function safeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export type { SketchCache };

export {
  DEFAULT_SKETCH_CACHE_DIR,
  DEFAULT_SKETCH_CACHE_MAX_ENTRIES,
  DEFAULT_SKETCH_CACHE_TTL_MS,
  MemorySketchCache,
};
