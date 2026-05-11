import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { hashBytes } from "@/lib/imageHash";
import {
  LIFE_SKETCH_INPUT_FINGERPRINT_VERSION,
  getAcceptedLifeSketchCachePath,
  resolveAcceptedLifeSketchArtifact,
} from "./lifeSketchAsset";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("accepted Life Sketch asset", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "btk-life-sketch-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("resolves only QA-accepted GPT Image 2 prebakes", async () => {
    const cachePath = getAcceptedLifeSketchCachePath("resale-exec-1990s", root);
    const anchorPath = join(root, "life-anchors", "resale-exec-1990s", "anchor.png");
    const topologyPath = join(root, "plan-sketches", "resale-exec-1990s", "plan.png");
    await mkdir(cachePath.directory, { recursive: true });
    await mkdir(join(root, "life-anchors", "resale-exec-1990s"), { recursive: true });
    await mkdir(join(root, "plan-sketches", "resale-exec-1990s"), { recursive: true });
    await writeFile(anchorPath, Buffer.concat([PNG_MAGIC, Buffer.from([1])]));
    await writeFile(topologyPath, Buffer.concat([PNG_MAGIC, Buffer.from([2])]));
    await writeFile(cachePath.absolutePath, PNG_MAGIC);
    await writeFile(cachePath.metadataAbsolutePath, JSON.stringify({
      templateId: "resale-exec-1990s",
      source: "accepted_gpt_image_2_prebake",
      promptKind: "life-sketch-from-anchor",
      candidateCount: 3,
      acceptedCandidateIndex: 1,
      rejectedCandidates: [{ candidateIndex: 0, reason: "window_side_drift" }],
      acceptedAtIso: "2026-05-11T00:45:34.708Z",
      reviewerModel: "gpt-4.1-mini",
      anchorCachePath: "life-anchors/resale-exec-1990s/anchor.png",
      topologyProof: "plan-sketches/resale-exec-1990s/plan.png",
      inputFingerprintVersion: LIFE_SKETCH_INPUT_FINGERPRINT_VERSION,
      anchorHash: hashBytes(Buffer.concat([PNG_MAGIC, Buffer.from([1])])),
      topologyProofHash: hashBytes(Buffer.concat([PNG_MAGIC, Buffer.from([2])])),
    }));

    const artifact = await resolveAcceptedLifeSketchArtifact("resale-exec-1990s", root);

    assert.ok(artifact);
    assert.equal(artifact.source, "accepted-gpt-image-2-prebake");
    assert.equal(artifact.cachePath, "life-sketches/resale-exec-1990s/accepted.png");
    assert.equal(artifact.metadata.acceptedCandidateIndex, 1);
  });

  it("ignores stale sidecars that do not match the requested template", async () => {
    const cachePath = getAcceptedLifeSketchCachePath("resale-exec-1990s", root);
    await mkdir(cachePath.directory, { recursive: true });
    await writeFile(cachePath.absolutePath, PNG_MAGIC);
    await writeFile(cachePath.metadataAbsolutePath, JSON.stringify({
      templateId: "tengah-5room",
      source: "accepted_gpt_image_2_prebake",
      promptKind: "life-sketch-from-anchor",
      candidateCount: 3,
      acceptedCandidateIndex: 1,
      rejectedCandidates: [],
      acceptedAtIso: "2026-05-11T00:45:34.708Z",
    }));

    assert.equal(await resolveAcceptedLifeSketchArtifact("resale-exec-1990s", root), null);
  });

  it("ignores accepted prebakes whose structural inputs are stale", async () => {
    const cachePath = getAcceptedLifeSketchCachePath("resale-exec-1990s", root);
    const anchorPath = join(root, "life-anchors", "resale-exec-1990s", "anchor.png");
    const topologyPath = join(root, "plan-sketches", "resale-exec-1990s", "plan.png");
    await mkdir(cachePath.directory, { recursive: true });
    await mkdir(join(root, "life-anchors", "resale-exec-1990s"), { recursive: true });
    await mkdir(join(root, "plan-sketches", "resale-exec-1990s"), { recursive: true });
    await writeFile(anchorPath, Buffer.concat([PNG_MAGIC, Buffer.from([3])]));
    await writeFile(topologyPath, Buffer.concat([PNG_MAGIC, Buffer.from([4])]));
    await writeFile(cachePath.absolutePath, PNG_MAGIC);
    await writeFile(cachePath.metadataAbsolutePath, JSON.stringify({
      templateId: "resale-exec-1990s",
      source: "accepted_gpt_image_2_prebake",
      promptKind: "life-sketch-from-anchor",
      candidateCount: 3,
      acceptedCandidateIndex: 1,
      rejectedCandidates: [],
      acceptedAtIso: "2026-05-11T00:45:34.708Z",
      anchorCachePath: "life-anchors/resale-exec-1990s/anchor.png",
      topologyProof: "plan-sketches/resale-exec-1990s/plan.png",
      inputFingerprintVersion: LIFE_SKETCH_INPUT_FINGERPRINT_VERSION,
      anchorHash: hashBytes(Buffer.concat([PNG_MAGIC, Buffer.from([3])])),
      topologyProofHash: "old-proof-hash",
    }));

    assert.equal(await resolveAcceptedLifeSketchArtifact("resale-exec-1990s", root), null);
  });
});
