// Content-addressable cache for OpenAI image renders.
//
// Sketches are tier "prototype_visualisation" (evidence.ts). Cache hits are
// deterministic and safe to ship without an API key — we only call OpenAI on
// a true cache miss, and we surface the missing-key state clearly to the
// route layer instead of failing open.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { hashString } from "@/lib/imageHash";
import type { ImagePromptKind } from "@/server/folio/prompts";

// Cache lives outside .next/ so it survives next builds and inside .gitignore
// so it never enters version control. Resolved relative to the app root
// (process.cwd() during `next dev`/`next build` and `tsx scripts/...`).
const DEFAULT_CACHE_DIR = resolve(process.cwd(), ".cache", "sketches");

export interface CacheKeyInputs {
  imageHashes?: string[];
  seed?: string;
}

export function keyFor(promptKind: ImagePromptKind, inputs: CacheKeyInputs): string {
  const parts = [
    `kind=${promptKind}`,
    `images=${(inputs.imageHashes ?? []).join(",")}`,
    `seed=${inputs.seed ?? ""}`,
  ];
  return hashString(parts.join("|"));
}

function cachePath(dir: string, key: string): string {
  return join(dir, `${key}.png`);
}

export async function getCached(key: string, dir: string = DEFAULT_CACHE_DIR): Promise<Buffer | null> {
  try {
    return await readFile(cachePath(dir, key));
  } catch {
    return null;
  }
}

export async function putCached(key: string, bytes: Buffer, dir: string = DEFAULT_CACHE_DIR): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(cachePath(dir, key), bytes);
}

export const DEFAULT_SKETCH_CACHE_DIR = DEFAULT_CACHE_DIR;
