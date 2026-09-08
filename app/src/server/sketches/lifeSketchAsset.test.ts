import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { hashBytes } from "@/lib/imageHash";
import { getPlanGeometry } from "@/server/geometry/registry";
import { renderTopologyProofSvg } from "@/server/openai/fallbackSvg";
import { rasterizeSvgToPng } from "@/server/openai/svgRaster";
import { buildPlanSketchCacheMetadata, getPlanSketchCachePath } from "./planSketchAsset";
import { getAcceptedLifeSketchCachePath, lifeSketchInputFingerprint, resolveAcceptedLifeSketchArtifact } from "./lifeSketchAsset";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==", "base64");
const TEMPLATE = "resale-exec-1990s";

describe("accepted Life Sketch asset", () => {
  let root: string;
  let cache: ReturnType<typeof getAcceptedLifeSketchCachePath>;
  let metadata: Record<string, unknown>;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "btk-life-sketch-"));
    cache = getAcceptedLifeSketchCachePath(TEMPLATE, root);
    const topology = await rasterizeSvgToPng(renderTopologyProofSvg(getPlanGeometry(TEMPLATE)));
    assert.ok(topology.ok);
    await mkdir(cache.directory, { recursive: true });
    for (const [directory, name] of [["life-anchors", "anchor.png"], ["plan-sketches", "plan.png"]]) {
      await mkdir(join(root, directory, TEMPLATE), { recursive: true });
      await writeFile(join(root, directory, TEMPLATE, name), directory === "plan-sketches" ? topology.png : PNG);
    }
    await writeFile(getPlanSketchCachePath(TEMPLATE, root).metadataAbsolutePath, JSON.stringify(
      buildPlanSketchCacheMetadata(TEMPLATE, renderTopologyProofSvg(getPlanGeometry(TEMPLATE)), topology.png),
    ));
    await writeFile(cache.absolutePath, PNG);
    metadata = {
      templateId: TEMPLATE,
      source: "accepted_gpt_image_2_prebake",
      promptKind: "life-sketch-from-anchor",
      candidateCount: 3,
      acceptedCandidateIndex: 1,
      rejectedCandidates: [{ candidateIndex: 0, reason: "window_side_drift" }],
      acceptedAtIso: "2026-05-11T00:45:34.708Z",
      generationModel: "gpt-image-2",
      reviewerModel: "gpt-4.1-mini",
      reviewerSummary: "Candidate 1 preserves the locked plan.",
      candidateReviews: [0, 1, 2].map((candidateIndex) => ({
        candidateIndex, status: candidateIndex === 1 ? "accepted" : "rejected", reasons: candidateIndex === 1 ? [] : ["window_side_drift"],
        observedBathroomCount: 2,
        checks: { roomTopology: "pass", windowBalconyDirection: "pass", kitchenHsPipeshaft: "pass", majorWallMasses: "pass", cameraView: "pass", bathroomCount: "pass", serviceYard: "pass", householdShelterInterior: "pass" },
      })),
      evidenceTier: "prototype_visualisation",
      sourceTruth: "plan-geometry.json",
      anchorCachePath: `life-anchors/${TEMPLATE}/anchor.png`,
      topologyProof: `plan-sketches/${TEMPLATE}/plan.png`,
      ...lifeSketchInputFingerprint(TEMPLATE, PNG, { topologyProof: topology.png }),
      pngHash: hashBytes(PNG),
    };
    await writeFile(cache.metadataAbsolutePath, JSON.stringify(metadata));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("resolves a matching accepted image and its exact input provenance", async () => {
    const artifact = await resolveAcceptedLifeSketchArtifact(TEMPLATE, root);
    assert.ok(artifact);
    assert.equal(artifact.source, "accepted-gpt-image-2-prebake");
    assert.equal(artifact.metadata.acceptedCandidateIndex, 1);
  });

  for (const invalid of [
    { candidateCount: undefined }, { candidateCount: "3" }, { candidateCount: 2.5 }, { candidateCount: 4 },
    { acceptedCandidateIndex: undefined }, { acceptedCandidateIndex: "1" },
    { acceptedCandidateIndex: -1 }, { acceptedCandidateIndex: 3 }, { acceptedCandidateIndex: 0.5 },
    { templateId: "tengah-5room" }, { qaGateVersion: "old-gate" }, { generationModel: undefined },
    { sourceTruth: undefined }, { reviewerModel: undefined }, { candidateReviews: undefined }, { inputFingerprintVersion: "old-fingerprint" },
    { anchorHash: "old-anchor" }, { topologyProofHash: "old-proof" }, { manifestHash: "old-scene" },
    { promptHash: "old-prompt" }, { brandHash: "old-brand" }, { materialHash: "old-material" },
    { pngHash: "old-image" }, { acceptedAtIso: "invalid-date" }, { rejectedCandidates: undefined },
    { anchorCachePath: `plan-sketches/${TEMPLATE}/plan.png` },
  ]) {
    it(`rejects invalid or stale ${Object.keys(invalid).join(",")}: ${JSON.stringify(invalid)}`, async () => {
      await writeFile(cache.metadataAbsolutePath, JSON.stringify({ ...metadata, ...invalid }));
      assert.equal(await resolveAcceptedLifeSketchArtifact(TEMPLATE, root), null);
    });
  }

  it("invalidates when source files change after acceptance", async () => {
    await writeFile(join(root, "life-anchors", TEMPLATE, "anchor.png"), Buffer.concat([PNG, PNG]));
    assert.equal(await resolveAcceptedLifeSketchArtifact(TEMPLATE, root), null);
  });

  it("rejects a stale topology proof even when its sidecar byte hash was restamped", async () => {
    await writeFile(join(root, "plan-sketches", TEMPLATE, "plan.png"), PNG);
    await writeFile(cache.metadataAbsolutePath, JSON.stringify({ ...metadata, topologyProofHash: hashBytes(PNG) }));
    assert.equal(await resolveAcceptedLifeSketchArtifact(TEMPLATE, root), null);
  });

  it("rejects accepted status when recorded structural review evidence fails", async () => {
    const candidateReviews = structuredClone(metadata.candidateReviews) as Array<{ checks: { cameraView: string } }>;
    candidateReviews[1].checks.cameraView = "fail";
    await writeFile(cache.metadataAbsolutePath, JSON.stringify({ ...metadata, candidateReviews }));
    assert.equal(await resolveAcceptedLifeSketchArtifact(TEMPLATE, root), null);
  });

  it("rejects a mismatched PNG during image and metadata publication", async () => {
    const originalMetadata = await readFile(cache.metadataAbsolutePath, "utf8");
    await writeFile(cache.absolutePath, Buffer.concat([PNG, PNG]));
    assert.equal(await resolveAcceptedLifeSketchArtifact(TEMPLATE, root), null);
    assert.equal(await readFile(cache.metadataAbsolutePath, "utf8"), originalMetadata);
  });

  it("invalidates when a previously absent style reference appears", async () => {
    await mkdir(join(root, "references"));
    await writeFile(join(root, "references", "hdb-material-board.png"), PNG);
    assert.equal(await resolveAcceptedLifeSketchArtifact(TEMPLATE, root), null);
  });
});
