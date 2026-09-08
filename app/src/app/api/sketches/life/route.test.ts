import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  clearLifeAnchorByteCache,
  getLifeAnchorCachePath,
  buildLifeAnchorCacheMetadata,
  buildLifeAnchorSceneManifest,
} from "@/server/anchors/lifeAnchor";
import { getPlanGeometry } from "@/server/geometry/registry";
import { renderTopologyProofSvg } from "@/server/openai/fallbackSvg";
import { rasterizeSvgToPng } from "@/server/openai/svgRaster";
import { buildPlanSketchCacheMetadata, getPlanSketchCachePath } from "@/server/sketches/planSketchAsset";
import { hashBytes } from "@/lib/imageHash";
import type { TemplateId } from "@/server/geometry/types";
import {
  getAcceptedLifeSketchCachePath,
  lifeSketchInputFingerprint,
  loadLifeSketchStyleReferences,
} from "@/server/sketches/lifeSketchAsset";
import { POST } from "./route";

// Real 1x1 PNG fixtures keep the transport and persisted-image checks active.
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==";

function candidateBase64(_index: number): string {
  return TINY_PNG_BASE64;
}

function reviewPayload(acceptedCandidateIndex = 1, acceptedObserved = 2): Record<string, unknown> {
  return {
    acceptedCandidateIndex,
    summary: "candidate_1_preserves_locked_topology",
    candidateReviews: [
      {
        candidateIndex: 0,
        status: "rejected",
        reasons: ["window_side_drift"],
        observedBathroomCount: 2,
        checks: {
          roomTopology: "pass",
          windowBalconyDirection: "fail",
          kitchenHsPipeshaft: "pass",
          majorWallMasses: "pass",
          cameraView: "pass",
          bathroomCount: "pass",
          serviceYard: "pass",
          householdShelterInterior: "pass",
        },
      },
      {
        candidateIndex: 1,
        status: "accepted",
        reasons: [],
        observedBathroomCount: acceptedObserved,
        checks: {
          roomTopology: "pass",
          windowBalconyDirection: "pass",
          kitchenHsPipeshaft: "pass",
          majorWallMasses: "pass",
          cameraView: "pass",
          bathroomCount: acceptedObserved === 2 ? "pass" : "fail",
          serviceYard: "pass",
          householdShelterInterior: "pass",
        },
      },
      {
        candidateIndex: 2,
        status: "rejected",
        reasons: ["hs_pipeshaft_relation_drift"],
        observedBathroomCount: 2,
        checks: {
          roomTopology: "pass",
          windowBalconyDirection: "pass",
          kitchenHsPipeshaft: "fail",
          majorWallMasses: "pass",
          cameraView: "pass",
          bathroomCount: "pass",
          serviceYard: "pass",
          householdShelterInterior: "pass",
        },
      },
    ],
  };
}

interface EnvSnapshot {
  OPENAI_API_KEY: string | undefined;
  LIFE_ANCHOR_CACHE_ROOT: string | undefined;
  LIFE_SKETCH_CACHE_ROOT: string | undefined;
  PLAN_SKETCH_CACHE_ROOT: string | undefined;
  SKETCH_CACHE_DIR: string | undefined;
  SKETCH_CACHE_PROVIDER: string | undefined;
}

function snapshotEnv(): EnvSnapshot {
  return {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    LIFE_ANCHOR_CACHE_ROOT: process.env.LIFE_ANCHOR_CACHE_ROOT,
    LIFE_SKETCH_CACHE_ROOT: process.env.LIFE_SKETCH_CACHE_ROOT,
    PLAN_SKETCH_CACHE_ROOT: process.env.PLAN_SKETCH_CACHE_ROOT,
    SKETCH_CACHE_DIR: process.env.SKETCH_CACHE_DIR,
    SKETCH_CACHE_PROVIDER: process.env.SKETCH_CACHE_PROVIDER,
  };
}

function restoreEnv(snap: EnvSnapshot): void {
  for (const [k, v] of Object.entries(snap)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

interface PostBody {
  templateId?: string;
  anchorPng?: string;
}

function postLife(body: PostBody, accept?: string, url = "https://example.com/api/sketches/life"): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accept) headers.accept = accept;
  return new Request(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function writeAnchorMetadata(templateId: TemplateId, png: Buffer, root?: string): Promise<void> {
  const cache = getLifeAnchorCachePath(templateId, root);
  await writeFile(cache.metadataAbsolutePath, JSON.stringify(buildLifeAnchorCacheMetadata(buildLifeAnchorSceneManifest(getPlanGeometry(templateId), root), png)));
}

async function seedAcceptedLifeSketch(root: string, templateId: TemplateId) {
  process.env.PLAN_SKETCH_CACHE_ROOT = root;
  const cachePath = getAcceptedLifeSketchCachePath(templateId, root);
  const anchorPath = join(root, "life-anchors", templateId, "anchor.png");
  const topologyPath = join(root, "plan-sketches", templateId, "plan.png");
  const topology = await rasterizeSvgToPng(renderTopologyProofSvg(getPlanGeometry(templateId)));
  assert.ok(topology.ok);
  await mkdir(cachePath.directory, { recursive: true });
  await mkdir(join(root, "life-anchors", templateId), { recursive: true });
  await mkdir(join(root, "plan-sketches", templateId), { recursive: true });
  await writeFile(anchorPath, Buffer.from(TINY_PNG_BASE64, "base64"));
  await writeAnchorMetadata(templateId, Buffer.from(TINY_PNG_BASE64, "base64"), root);
  await writeFile(topologyPath, topology.png);
  await writeFile(getPlanSketchCachePath(templateId, root).metadataAbsolutePath, JSON.stringify(
    buildPlanSketchCacheMetadata(templateId, renderTopologyProofSvg(getPlanGeometry(templateId)), topology.png),
  ));
  await writeFile(cachePath.absolutePath, Buffer.from(TINY_PNG_BASE64, "base64"));
  await writeFile(cachePath.metadataAbsolutePath, JSON.stringify({
    templateId,
    source: "accepted_gpt_image_2_prebake",
    promptKind: "life-sketch-from-anchor",
    candidateCount: 3,
    acceptedCandidateIndex: 1,
    rejectedCandidates: [
      { candidateIndex: 0, reason: "window_side_drift" },
      { candidateIndex: 2, reason: "camera_view_drift" },
    ],
    acceptedAtIso: "2026-05-11T00:45:34.708Z",
    reviewerModel: "gpt-4.1-mini",
    reviewerSummary: "candidate_1_preserves_locked_topology",
    candidateReviews: reviewPayload(1).candidateReviews,
    generationModel: "gpt-image-2",
    sourceTruth: "plan-geometry.json",
    evidenceTier: "prototype_visualisation",
    anchorCachePath: `life-anchors/${templateId}/anchor.png`,
    topologyProof: `plan-sketches/${templateId}/plan.png`,
    ...lifeSketchInputFingerprint(templateId, Buffer.from(TINY_PNG_BASE64, "base64"), {
      ...await loadLifeSketchStyleReferences(),
      topologyProof: topology.png,
    }),
    pngHash: hashBytes(Buffer.from(TINY_PNG_BASE64, "base64")),
  }));
  return cachePath;
}

describe("Life Sketch route", () => {
  let tempCacheDir: string;
  let envSnap: EnvSnapshot;
  let originalFetch: typeof globalThis.fetch;
  // Files we wrote into the default `.cache/render/...` tree so we can clean
  // up without nuking unrelated cached anchors.
  const writtenAnchors: string[] = [];

  beforeEach(async () => {
    envSnap = snapshotEnv();
    originalFetch = globalThis.fetch;
    tempCacheDir = await mkdtemp(join(tmpdir(), "btk-life-route-"));
    process.env.LIFE_ANCHOR_CACHE_ROOT = tempCacheDir;
    process.env.LIFE_SKETCH_CACHE_ROOT = tempCacheDir;
    process.env.SKETCH_CACHE_PROVIDER = "file";
    process.env.SKETCH_CACHE_DIR = tempCacheDir;
    process.env.PLAN_SKETCH_CACHE_ROOT = tempCacheDir;
    for (const templateId of ["tengah-5room", "resale-exec-1990s"] as const) {
      const topology = await rasterizeSvgToPng(renderTopologyProofSvg(getPlanGeometry(templateId)));
      assert.ok(topology.ok);
      const directory = join(tempCacheDir, "plan-sketches", templateId);
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, "plan.png"), topology.png);
      await writeFile(getPlanSketchCachePath(templateId, tempCacheDir).metadataAbsolutePath, JSON.stringify(
        buildPlanSketchCacheMetadata(templateId, renderTopologyProofSvg(getPlanGeometry(templateId)), topology.png),
      ));
    }
    clearLifeAnchorByteCache();
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    restoreEnv(envSnap);
    clearLifeAnchorByteCache();
    await Promise.all(
      writtenAnchors.splice(0).map((p) => rm(p, { force: true })),
    );
    await rm(tempCacheDir, { recursive: true, force: true });
  });

  it("rejects unknown templateId with 400", async () => {
    const response = await POST(postLife({ templateId: "not-a-template" }));
    assert.equal(response.status, 400);
  });

  it("anchor-cache + OpenAI-mocked path returns PNG with full telemetry", async () => {
    process.env.OPENAI_API_KEY = "sk-test";

    // Seed the per-template anchor PNG at the default cache location.
    const cachePath = getLifeAnchorCachePath("tengah-5room");
    await mkdir(cachePath.directory, { recursive: true });
    await writeFile(cachePath.absolutePath, Buffer.from(TINY_PNG_BASE64, "base64"));
    await writeAnchorMetadata(cachePath.templateId, Buffer.from(TINY_PNG_BASE64, "base64"));
    writtenAnchors.push(cachePath.absolutePath);

    let imageCalls = 0;
    let reviewCalls = 0;
    let editForm: FormData | undefined;
    let reviewBody: Record<string, unknown> | undefined;
    globalThis.fetch = (async (url, init) => {
      const href = String(url);
      if (href.includes("/v1/responses")) {
        reviewCalls += 1;
        reviewBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({ output_text: JSON.stringify(reviewPayload(1)) }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      imageCalls += 1;
      editForm = init?.body as FormData;
      return new Response(
        JSON.stringify({
          data: [
            { b64_json: candidateBase64(0) },
            { b64_json: candidateBase64(1) },
            { b64_json: candidateBase64(2) },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const response = await POST(postLife(
      { templateId: "tengah-5room" },
      undefined,
      "https://example.com/api/sketches/life?materialize=1",
    ));
    const bytes = Buffer.from(await response.arrayBuffer());

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(response.headers.get("x-from-cache"), "false");
    assert.equal(response.headers.get("x-evidence-tier"), "prototype_visualisation");
    assert.equal(response.headers.get("x-prompt-id"), "life-sketch-from-anchor");
    assert.equal(response.headers.get("x-life-anchor-source"), "cache-png");
    assert.equal(response.headers.get("x-life-anchor-scene"), "three-orthographic-greybox-scene-manifest");
    assert.equal(response.headers.get("x-life-topology-proof"), "local-plan-sketch");
    assert.equal(response.headers.get("x-life-brand-reference"), "present");
    assert.equal(response.headers.get("x-life-material-reference"), "present");
    assert.equal(response.headers.get("x-life-sketch-candidates"), "3");
    assert.equal(response.headers.get("x-life-sketch-qa"), "accepted");
    assert.equal(response.headers.get("x-life-sketch-qa-model"), "gpt-4.1-mini");
    assert.equal(response.headers.get("x-life-sketch-accepted-candidate"), "1");
    assert.equal(
      response.headers.get("x-life-anchor-cache-path"),
      "life-anchors/tengah-5room/anchor.png",
    );
    assert.equal(bytes.subarray(0, 8).toString("hex"), PNG_MAGIC.toString("hex"));
    assert.deepEqual(bytes, Buffer.from(candidateBase64(1), "base64"));
    assert.equal(imageCalls, 1);
    assert.equal(reviewCalls, 1);
    assert.equal(editForm?.getAll("image[]").length, 4);
    const reviewInput = reviewBody?.input as Array<{ content: Array<{ type: string }> }> | undefined;
    const reviewImageInputs = reviewInput?.[0]?.content.filter((item) => item.type === "input_image") ?? [];
    assert.equal(reviewImageInputs.length, 5);

    const files = await readdir(tempCacheDir);
    const metadataFile = files.find((file) => file.endsWith(".json"));
    assert.ok(metadataFile);
    const metadata = JSON.parse(await readFile(join(tempCacheDir, metadataFile), "utf8")) as {
      rejectedCandidates: Array<{ candidateIndex: number; reason: string }>;
    };
    assert.deepEqual(metadata.rejectedCandidates, [
      { candidateIndex: 0, reason: "window_side_drift" },
      { candidateIndex: 2, reason: "hs_pipeshaft_relation_drift" },
    ]);
  });

  it("anchor-only path (no anchor cache, no OpenAI key, Accept svg) returns deterministic anchor SVG", async () => {
    delete process.env.OPENAI_API_KEY;

    const response = await POST(
      postLife({ templateId: "resale-exec-1990s" }, "image/svg+xml", "https://example.com/api/sketches/life?anchor=1"),
    );
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/svg+xml");
    assert.equal(response.headers.get("x-life-anchor-source"), "deterministic-svg");
    assert.equal(response.headers.get("x-life-anchor-scene"), "three-orthographic-greybox-scene-manifest");
    assert.equal(response.headers.get("x-sketch-fallback"), "deterministic-anchor-svg");
    assert.equal(response.headers.get("x-evidence-tier"), "prototype_visualisation");
    assert.match(body, /camera-view greybox anchor/);
    assert.doesNotMatch(body, /DRAFT · PROTOTYPE VISUALISATION/);
  });

  it("default path serves accepted GPT Image 2 prebake before deterministic fallback", async () => {
    delete process.env.OPENAI_API_KEY;

    const anchorPath = getLifeAnchorCachePath("resale-exec-1990s");
    await mkdir(anchorPath.directory, { recursive: true });
    await writeFile(anchorPath.absolutePath, Buffer.from(TINY_PNG_BASE64, "base64"));
    await writeAnchorMetadata(anchorPath.templateId, Buffer.from(TINY_PNG_BASE64, "base64"));
    writtenAnchors.push(anchorPath.absolutePath);
    const acceptedPath = await seedAcceptedLifeSketch(tempCacheDir, "resale-exec-1990s");

    const response = await POST(postLife({ templateId: "resale-exec-1990s" }, "image/png"));
    const bytes = Buffer.from(await response.arrayBuffer());

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(response.headers.get("x-sketch-source"), "accepted-gpt-image-2-prebake");
    assert.equal(response.headers.get("x-life-sketch-mode"), "accepted-gpt-image-2-prebake");
    assert.equal(response.headers.get("x-sketch-fallback"), null);
    assert.equal(response.headers.get("x-prompt-id"), "life-sketch-from-anchor");
    assert.equal(response.headers.get("x-life-sketch-qa"), "accepted_from_prebake");
    assert.equal(response.headers.get("x-life-sketch-candidates"), "3");
    assert.equal(response.headers.get("x-life-sketch-accepted-candidate"), "1");
    assert.equal(response.headers.get("x-life-sketch-qa-model"), "gpt-4.1-mini");
    assert.equal(response.headers.get("x-life-sketch-cache-path"), acceptedPath.relativePath);
    assert.equal(response.headers.get("x-life-sketch-metadata-path"), acceptedPath.metadataRelativePath);
    assert.equal(response.headers.get("x-life-anchor-source"), "cache-png");
    assert.equal(response.headers.get("x-life-anchor-scene"), "three-orthographic-greybox-scene-manifest");
    assert.equal(bytes.subarray(0, 8).toString("hex"), PNG_MAGIC.toString("hex"));
  });

  it("default path surfaces a protected-space source conflict without generation", async () => {
    delete process.env.OPENAI_API_KEY;

    const cachePath = getLifeAnchorCachePath("tampines-greenweave");
    await mkdir(cachePath.directory, { recursive: true });
    await writeFile(cachePath.absolutePath, Buffer.from(TINY_PNG_BASE64, "base64"));
    await writeAnchorMetadata(cachePath.templateId, Buffer.from(TINY_PNG_BASE64, "base64"));
    writtenAnchors.push(cachePath.absolutePath);

    const response = await POST(postLife({ templateId: "tampines-greenweave" }, "image/svg+xml"));
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/svg+xml");
    assert.equal(response.headers.get("x-sketch-source"), "deterministic-sumi-e-life-sketch");
    assert.equal(response.headers.get("x-life-sketch-mode"), "deterministic-sumi-e");
    assert.equal(response.headers.get("x-sketch-fallback"), "geometry_source_conflict");
    assert.equal(response.headers.get("x-life-anchor-source"), "deterministic-svg");
    assert.equal(response.headers.get("x-life-anchor-scene"), "three-orthographic-greybox-scene-manifest");
    assert.equal(response.headers.get("x-prompt-id"), null);
    assert.match(body, /data-life-sketch-source="deterministic-sumi-e"/);
    assert.match(body, /locked-anchor-materialized-surfaces/);
  });

  it("anchor-only cache path emits local prebaked anchor PNG", async () => {
    delete process.env.OPENAI_API_KEY;

    const cachePath = getLifeAnchorCachePath("tampines-greenweave");
    await mkdir(cachePath.directory, { recursive: true });
    await writeFile(cachePath.absolutePath, Buffer.from(TINY_PNG_BASE64, "base64"));
    await writeAnchorMetadata(cachePath.templateId, Buffer.from(TINY_PNG_BASE64, "base64"));
    writtenAnchors.push(cachePath.absolutePath);

    const response = await POST(
      postLife({ templateId: "tampines-greenweave" }, undefined, "https://example.com/api/sketches/life?anchor=1"),
    );
    const bytes = Buffer.from(await response.arrayBuffer());

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(response.headers.get("x-sketch-fallback"), "local-prebaked-anchor");
    assert.equal(response.headers.get("x-sketch-source"), "local-prebaked-anchor");
    assert.equal(response.headers.get("x-life-anchor-source"), "cache-png");
    assert.equal(response.headers.get("x-life-anchor-scene"), "three-orthographic-greybox-scene-manifest");
    assert.equal(response.headers.get("x-prompt-id"), null);
    assert.equal(bytes.subarray(0, 8).toString("hex"), PNG_MAGIC.toString("hex"));
  });

  it("client-supplied anchorPng + no key + JSON Accept surfaces OPENAI_API_KEY in nextAction", async () => {
    // Reaches the lower body anchorPng + JSON branch which is the only path
    // that yields a structured fallback with the OPENAI_API_KEY hint.
    delete process.env.OPENAI_API_KEY;

    const response = await POST(
      postLife(
        { templateId: "tengah-5room", anchorPng: TINY_PNG_BASE64 },
        "application/json",
      ),
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.fallback, true);
    assert.equal(body.tier, "prototype_visualisation");
    assert.match(body.nextAction, /OPENAI_API_KEY/);
    assert.equal(body.anchor.source, "request-png");
    assert.equal(body.anchor.scene, "three-orthographic-greybox-scene-manifest");
    assert.equal(response.headers.get("x-life-topology-proof"), "local-plan-sketch");
    assert.equal(response.headers.get("x-life-brand-reference"), "present");
    assert.equal(response.headers.get("x-life-material-reference"), "present");
  });

  it("client-supplied anchorPng path stubs OpenAI and returns PNG", async () => {
    process.env.OPENAI_API_KEY = "sk-test";

    let imageCalls = 0;
    let reviewCalls = 0;
    let editForm: FormData | undefined;
    globalThis.fetch = (async (url, init) => {
      const href = String(url);
      if (href.includes("/v1/responses")) {
        reviewCalls += 1;
        return new Response(
          JSON.stringify({ output_text: JSON.stringify(reviewPayload(1)) }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      imageCalls += 1;
      editForm = init?.body as FormData;
      return new Response(
        JSON.stringify({
          data: [
            { b64_json: candidateBase64(0) },
            { b64_json: candidateBase64(1) },
            { b64_json: candidateBase64(2) },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const response = await POST(
      postLife({ templateId: "resale-exec-1990s", anchorPng: TINY_PNG_BASE64 }),
    );
    const bytes = Buffer.from(await response.arrayBuffer());

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(response.headers.get("x-from-cache"), "false");
    assert.equal(response.headers.get("x-life-anchor-source"), "request-png");
    assert.equal(response.headers.get("x-prompt-id"), "life-sketch-from-anchor");
    assert.equal(response.headers.get("x-life-topology-proof"), "local-plan-sketch");
    assert.equal(response.headers.get("x-life-brand-reference"), "present");
    assert.equal(response.headers.get("x-life-material-reference"), "present");
    assert.equal(response.headers.get("x-life-sketch-candidates"), "3");
    assert.equal(response.headers.get("x-life-sketch-qa"), "accepted");
    assert.equal(response.headers.get("x-life-sketch-qa-model"), "gpt-4.1-mini");
    assert.equal(response.headers.get("x-life-sketch-accepted-candidate"), "1");
    assert.equal(bytes.subarray(0, 8).toString("hex"), PNG_MAGIC.toString("hex"));
    assert.deepEqual(bytes, Buffer.from(candidateBase64(1), "base64"));
    assert.equal(imageCalls, 1);
    assert.equal(reviewCalls, 1);
    assert.equal(editForm?.getAll("image[]").length, 4);
  });

  it("non-string anchorPng routes to deterministic Life Sketch fallback (does not 500)", async () => {
    // The route accepts only string anchorPng (typeof guard); other types
    // route to the no-anchor branch instead of crashing. This protects the
    // contract for older clients sending malformed payloads.
    delete process.env.OPENAI_API_KEY;
    const request = new Request("https://example.com/api/sketches/life", {
      method: "POST",
      headers: { "Content-Type": "application/json", accept: "image/svg+xml" },
      body: JSON.stringify({ templateId: "tengah-5room", anchorPng: 12345 }),
    });

    const response = await POST(request);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-life-sketch-mode"), "deterministic-sumi-e");
  });
});
