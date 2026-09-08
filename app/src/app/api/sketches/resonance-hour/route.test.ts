import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { hashBytes } from "@/lib/imageHash";
import { buildLifeAnchorCacheMetadata, buildLifeAnchorSceneManifest, getLifeAnchorCachePath } from "@/server/anchors/lifeAnchor";
import { getPlanGeometry } from "@/server/geometry/registry";
import { renderTopologyProofSvg } from "@/server/openai/fallbackSvg";
import { rasterizeSvgToPng } from "@/server/openai/svgRaster";
import { buildPlanSketchCacheMetadata, getPlanSketchCachePath } from "@/server/sketches/planSketchAsset";
import { getAcceptedLifeSketchCachePath, lifeSketchInputFingerprint, loadLifeSketchStyleReferences, resolveAcceptedLifeSketchArtifact } from "@/server/sketches/lifeSketchAsset";
import { getResonanceHourCachePath, resonanceHourMetadata, resolveResonanceHourArtifact } from "@/server/sketches/resonanceHourAsset";
import { writeSketchArtifact } from "@/server/sketches/writeSketchArtifact";
import { POST } from "./route";

const TEMPLATE = "resale-exec-1990s";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==", "base64");
const ENV_KEYS = ["OPENAI_API_KEY", "LIFE_ANCHOR_CACHE_ROOT", "LIFE_SKETCH_CACHE_ROOT", "PLAN_SKETCH_CACHE_ROOT", "RESONANCE_HOUR_CACHE_ROOT", "SKETCH_CACHE_DIR", "SKETCH_CACHE_PROVIDER"];
function request(materialize = false, body: unknown = { templateId: TEMPLATE }) {
  return new Request(`https://example.com/api/sketches/resonance-hour${materialize ? "?materialize=1" : ""}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("Resonance Hour delivery and provenance", () => {
  let root: string;
  let environment: Record<string, string | undefined>;
  let originalFetch: typeof fetch;
  let calls: number;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "btk-resonance-route-"));
    environment = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    for (const key of ENV_KEYS) process.env[key] = root;
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.SKETCH_CACHE_PROVIDER = "file";
    originalFetch = globalThis.fetch;
    calls = 0;
    globalThis.fetch = async () => { calls += 1; throw new Error("Unexpected network request"); };
    const plan = getPlanGeometry(TEMPLATE);
    const anchor = getLifeAnchorCachePath(TEMPLATE);
    await mkdir(anchor.directory, { recursive: true });
    await writeFile(anchor.absolutePath, PNG);
    await writeFile(anchor.metadataAbsolutePath, JSON.stringify(buildLifeAnchorCacheMetadata(buildLifeAnchorSceneManifest(plan), PNG)));
    const topology = await rasterizeSvgToPng(renderTopologyProofSvg(plan));
    assert.ok(topology.ok);
    await mkdir(join(root, "plan-sketches", TEMPLATE), { recursive: true });
    await writeFile(join(root, "plan-sketches", TEMPLATE, "plan.png"), topology.png);
    await writeFile(getPlanSketchCachePath(TEMPLATE, root).metadataAbsolutePath, JSON.stringify(
      buildPlanSketchCacheMetadata(TEMPLATE, renderTopologyProofSvg(plan), topology.png),
    ));
    const life = getAcceptedLifeSketchCachePath(TEMPLATE);
    await writeSketchArtifact(life.absolutePath, life.metadataAbsolutePath, PNG, {
      templateId: TEMPLATE, source: "accepted_gpt_image_2_prebake", promptKind: "life-sketch-from-anchor",
      candidateCount: 3, acceptedCandidateIndex: 1, rejectedCandidates: [], acceptedAtIso: new Date().toISOString(),
      reviewerModel: "gpt-4.1-mini", reviewerSummary: "Candidate 1 preserves the plan.", generationModel: "gpt-image-2",
      candidateReviews: [0, 1, 2].map((candidateIndex) => ({ candidateIndex, status: candidateIndex === 1 ? "accepted" : "rejected", reasons: candidateIndex === 1 ? [] : ["camera_view_drift"], observedBathroomCount: 2,
        checks: { roomTopology: "pass", windowBalconyDirection: "pass", kitchenHsPipeshaft: "pass", majorWallMasses: "pass", cameraView: "pass", bathroomCount: "pass", serviceYard: "pass", householdShelterInterior: "pass" } })),
      evidenceTier: "prototype_visualisation", sourceTruth: "plan-geometry.json", anchorCachePath: anchor.relativePath,
      topologyProof: `plan-sketches/${TEMPLATE}/plan.png`, pngHash: hashBytes(PNG),
      ...lifeSketchInputFingerprint(TEMPLATE, PNG, { ...await loadLifeSketchStyleReferences(), topologyProof: topology.png }),
    });
  });
  afterEach(async () => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  });

  it("serves a validated prebake without a generation request", async () => {
    const life = await resolveAcceptedLifeSketchArtifact(TEMPLATE);
    assert.ok(life);
    const cache = getResonanceHourCachePath(TEMPLATE);
    await writeSketchArtifact(cache.absolutePath, cache.metadataAbsolutePath, PNG, resonanceHourMetadata(life, PNG, "gpt-image-2"));
    const response = await POST(request());
    assert.equal(response.headers.get("X-Sketch-Source"), "resonance-hour-prebake");
    assert.equal(response.headers.get("X-From-Cache"), "prebake");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), PNG);
    assert.equal(calls, 0);
  });

  it("falls back to accepted Life when no current Resonance prebake exists", async () => {
    const response = await POST(request());
    assert.equal(response.headers.get("X-Sketch-Source"), "accepted-gpt-image-2-prebake");
    assert.equal(response.headers.get("X-Sketch-Fallback"), "missing-current-resonance-prebake");
    assert.equal(calls, 0);
  });

  it("rejects stale source provenance and mismatched output bytes", async () => {
    const life = await resolveAcceptedLifeSketchArtifact(TEMPLATE);
    assert.ok(life);
    const cache = getResonanceHourCachePath(TEMPLATE);
    const metadata = resonanceHourMetadata(life, PNG, "gpt-image-2");
    await writeSketchArtifact(cache.absolutePath, cache.metadataAbsolutePath, PNG, { ...metadata, dependencyHashes: { acceptedLifeSketchHash: "old-source" } });
    assert.equal(await resolveResonanceHourArtifact(TEMPLATE, undefined, life), null);
    await writeSketchArtifact(cache.absolutePath, cache.metadataAbsolutePath, PNG.subarray(0, 8), metadata);
    assert.equal(await resolveResonanceHourArtifact(TEMPLATE, undefined, life), null);
  });

  it("materializes only explicitly and returns the server's exact source and output hashes", async () => {
    globalThis.fetch = async () => { calls += 1; return new Response(JSON.stringify({ data: [{ b64_json: PNG.toString("base64") }] }), { status: 200 }); };
    const response = await POST(request(true));
    assert.equal(response.headers.get("X-Sketch-Source"), "resonance-hour-background");
    assert.equal(calls, 1);
    const metadata = JSON.parse(Buffer.from(response.headers.get("X-Resonance-Hour-Metadata")!, "base64").toString());
    assert.equal(metadata.dependencyHashes.acceptedLifeSketchHash, hashBytes(PNG));
    assert.equal(metadata.pngHash, hashBytes(PNG));
    assert.equal(metadata.generationModel, "gpt-image-2");
    assert.equal(metadata.qaGateVersion, undefined);
  });

  it("never generates from a greybox when accepted Life is missing", async () => {
    await rm(getAcceptedLifeSketchCachePath(TEMPLATE).metadataAbsolutePath);
    const response = await POST(request(true));
    assert.equal(response.headers.get("X-Sketch-Source"), "local-prebaked-anchor");
    assert.equal(response.headers.get("X-Sketch-Fallback"), "missing-current-accepted-life-sketch");
    assert.equal(calls, 0);
  });

  it("rejects null JSON bodies with an actionable 400", async () => {
    assert.equal((await POST(request(false, null))).status, 400);
    assert.equal(calls, 0);
  });
});
