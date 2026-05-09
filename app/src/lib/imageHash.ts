// Deterministic content hashes for cache keys and prompt-input traceability.
// First 16 hex chars of sha256 is enough collision space for our cache and
// keeps file paths readable.

import { createHash } from "node:crypto";

const HASH_PREFIX_CHARS = 16;

export function hashBytes(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex").slice(0, HASH_PREFIX_CHARS);
}

export function hashString(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex").slice(0, HASH_PREFIX_CHARS);
}
