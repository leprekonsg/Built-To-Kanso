import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

// Readers verify the sidecar's PNG hash, so a concurrent read between the
// two renames falls back safely instead of accepting mismatched provenance.
export async function writeSketchArtifact(
  pngPath: string,
  metadataPath: string,
  png: Buffer,
  metadata: object,
): Promise<void> {
  const suffix = `.${randomUUID()}.tmp`;
  const pendingPng = pngPath + suffix;
  const pendingMetadata = metadataPath + suffix;
  await mkdir(dirname(pngPath), { recursive: true });
  try {
    await writeFile(pendingPng, png);
    await writeFile(pendingMetadata, JSON.stringify(metadata, null, 2), "utf8");
    await rename(pendingPng, pngPath);
    await rename(pendingMetadata, metadataPath);
  } finally {
    await Promise.all([unlink(pendingPng).catch(() => {}), unlink(pendingMetadata).catch(() => {})]);
  }
}
