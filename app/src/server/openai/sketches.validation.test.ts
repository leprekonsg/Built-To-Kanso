import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { generateLifeSketch } from "./sketches";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==",
  "base64",
);
const CHECKS = [
  "roomTopology", "windowBalconyDirection", "kitchenHsPipeshaft", "majorWallMasses",
  "cameraView", "bathroomCount", "serviceYard", "householdShelterInterior",
];
const ENV_KEYS = ["OPENAI_API_KEY", "OPENAI_REVIEW_MODEL", "SKETCH_CACHE_DIR", "SKETCH_CACHE_PROVIDER"] as const;

describe("Life Sketch generation protects reviewed cache entries", () => {
  let originalFetch: typeof fetch;
  let envSnapshot: Array<[string, string | undefined]>;
  let root: string;
  let imageCalls: number;
  let reviewCalls: number;
  let topologyVerdict: "pass" | "fail";
  let generationForms: FormData[];

  beforeEach(async () => {
    originalFetch = globalThis.fetch;
    envSnapshot = ENV_KEYS.map((key) => [key, process.env[key]]);
    root = await mkdtemp(join(tmpdir(), "kanso-sketch-validation-"));
    process.env.OPENAI_API_KEY = "sk-test-sketch-validation";
    process.env.OPENAI_REVIEW_MODEL = "gpt-4.1-mini";
    process.env.SKETCH_CACHE_DIR = root;
    process.env.SKETCH_CACHE_PROVIDER = "file";
    imageCalls = 0;
    reviewCalls = 0;
    topologyVerdict = "pass";
    generationForms = [];
    globalThis.fetch = (async (url, init) => {
      if (String(url).endsWith("/responses")) {
        reviewCalls += 1;
        return new Response(JSON.stringify({ output_text: JSON.stringify({
          acceptedCandidateIndex: 0,
          summary: "Locked structure preserved",
          candidateReviews: [0, 1, 2].map((candidateIndex) => ({
            candidateIndex,
            status: candidateIndex === 0 ? "accepted" : "rejected",
            reasons: [],
            observedBathroomCount: 2,
            checks: { ...Object.fromEntries(CHECKS.map((check) => [check, "pass"])), roomTopology: topologyVerdict },
          })),
        }) }), { status: 200 });
      }
      imageCalls += 1;
      assert.ok(init?.body instanceof FormData);
      generationForms.push(init.body);
      return new Response(JSON.stringify({ data: [0, 1, 2].map(() => ({ b64_json: PNG.toString("base64") })) }), { status: 200 });
    }) as typeof fetch;
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of envSnapshot) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  });

  it("rejects missing topology proof before an Images request", async () => {
    const result = await generateLifeSketch(PNG, {}, { lockedBathroomCount: 2 });
    assert.equal(result.ok, false);
    assert.equal(imageCalls, 0);
    assert.equal(reviewCalls, 0);
  });

  for (const count of [undefined, -1, 1.5, NaN, Infinity]) {
    it(`rejects invalid authoritative bathroom count ${String(count)} before an Images request`, async () => {
      const result = await generateLifeSketch(PNG, { topologyProof: PNG }, { lockedBathroomCount: count });
      assert.equal(result.ok, false);
      assert.equal(imageCalls, 0);
      assert.equal(reviewCalls, 0);
    });
  }

  it("reuses a reviewed entry for identical inputs without an API key", async () => {
    const context = { lockedBathroomCount: 2, manifestSummary: "locked-plan-A" };
    assert.equal((await generateLifeSketch(PNG, { topologyProof: PNG }, context)).ok, true);
    delete process.env.OPENAI_API_KEY;
    const cached = await generateLifeSketch(PNG, { topologyProof: PNG }, context);
    assert.equal(cached.ok, true);
    if (cached.ok) assert.equal(cached.fromCache, true);
    assert.equal(imageCalls, 1);
    assert.equal(reviewCalls, 1);
  });

  it("does not reuse acceptance when the authoritative bathroom count changes", async () => {
    assert.equal((await generateLifeSketch(PNG, { topologyProof: PNG }, { lockedBathroomCount: 2 })).ok, true);
    const changed = await generateLifeSketch(PNG, { topologyProof: PNG }, { lockedBathroomCount: 3 });
    assert.equal(changed.ok, false);
    assert.equal(imageCalls, 2);
    assert.equal(reviewCalls, 2);
  });

  it("sends supplied spatial room facts and bathroom counts in the actual multipart generation prompt", async () => {
    const manifestSummary = "template=locked-spatial-fixture; rooms=kitchen:kitchen@centerXZ=1.25,4.50,sizeXZ=2.50,3.00; yard:service_yard@centerXZ=1.25,1.00,sizeXZ=2.50,1.50; hs:shelter@centerXZ=6.75,1.00,sizeXZ=1.50,2.00";
    for (const lockedBathroomCount of [2, 3]) {
      await generateLifeSketch(PNG, { topologyProof: PNG }, { manifestSummary, lockedBathroomCount });
    }

    assert.equal(generationForms.length, 2);
    for (const [index, form] of generationForms.entries()) {
      const prompt = form.get("prompt");
      assert.equal(typeof prompt, "string");
      assert.ok((prompt as string).includes(manifestSummary), "Images must receive the supplied locked coordinates, not only the later reviewer");
      assert.ok((prompt as string).includes(`Exactly ${index + 2} bathrooms.`), "Images must receive each request's authoritative count");
      assert.match(prompt as string, /Match each kitchen, service yard and shelter to its own reference footprint before placing fixtures/);
      assert.match(prompt as string, /A washer in a shelter does not satisfy the service yard requirement/);
      assert.ok(form.getAll("image[]").length >= 2, "Spatial instructions must accompany the anchor and topology image references");
    }
  });

  it("does not reuse acceptance when the locked manifest changes", async () => {
    assert.equal((await generateLifeSketch(PNG, { topologyProof: PNG }, { lockedBathroomCount: 2, manifestSummary: "door-layout-A" })).ok, true);
    const changed = await generateLifeSketch(PNG, { topologyProof: PNG }, { lockedBathroomCount: 2, manifestSummary: "door-layout-B" });
    assert.equal(changed.ok, true);
    if (changed.ok) assert.equal(changed.fromCache, false);
    assert.equal(imageCalls, 2);
    assert.equal(reviewCalls, 2);
  });

  it("does not store a candidate whose accepted status contradicts its topology check", async () => {
    topologyVerdict = "fail";
    const context = { lockedBathroomCount: 2 };
    assert.equal((await generateLifeSketch(PNG, { topologyProof: PNG }, context)).ok, false);
    topologyVerdict = "pass";
    const corrected = await generateLifeSketch(PNG, { topologyProof: PNG }, context);
    assert.equal(corrected.ok, true);
    if (corrected.ok) assert.equal(corrected.fromCache, false);
    assert.equal(imageCalls, 2);
    assert.equal(reviewCalls, 2);
  });

  it("rerenders when cached pixels no longer match the reviewed image hash", async () => {
    const context = { lockedBathroomCount: 2 };
    assert.equal((await generateLifeSketch(PNG, { topologyProof: PNG }, context)).ok, true);
    const imageFile = (await readdir(root)).find((name) => name.endsWith(".png"));
    assert.ok(imageFile);
    const changed = Buffer.from(PNG);
    changed[47] ^= 1;
    await writeFile(join(root, imageFile), changed);

    const regenerated = await generateLifeSketch(PNG, { topologyProof: PNG }, context);
    assert.equal(regenerated.ok, true);
    if (regenerated.ok) {
      assert.equal(regenerated.fromCache, false);
      assert.deepEqual(regenerated.png, PNG);
    }
    assert.equal(imageCalls, 2);
  });

  it("reads changed file metadata and rejects contradictory cached acceptance", async () => {
    const context = { lockedBathroomCount: 2 };
    assert.equal((await generateLifeSketch(PNG, { topologyProof: PNG }, context)).ok, true);
    const metadataFile = (await readdir(root)).find((name) => name.endsWith(".json"));
    assert.ok(metadataFile);
    const metadataPath = join(root, metadataFile);
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    metadata.candidateReviews[0].checks.cameraView = "fail";
    await writeFile(metadataPath, JSON.stringify(metadata));

    const regenerated = await generateLifeSketch(PNG, { topologyProof: PNG }, context);
    assert.equal(regenerated.ok, true);
    if (regenerated.ok) assert.equal(regenerated.fromCache, false);
    assert.equal(imageCalls, 2);
    assert.equal(reviewCalls, 2);
  });

  it("does not borrow acceptance metadata from a different file cache directory", async () => {
    const context = { lockedBathroomCount: 2 };
    assert.equal((await generateLifeSketch(PNG, { topologyProof: PNG }, context)).ok, true);
    const imageFile = (await readdir(root)).find((name) => name.endsWith(".png"));
    assert.ok(imageFile);
    const secondCache = join(root, "separate-cache");
    await mkdir(secondCache);
    await writeFile(join(secondCache, imageFile), PNG);
    process.env.SKETCH_CACHE_DIR = secondCache;

    const regenerated = await generateLifeSketch(PNG, { topologyProof: PNG }, context);
    assert.equal(regenerated.ok, true);
    if (regenerated.ok) assert.equal(regenerated.fromCache, false);
    assert.equal(imageCalls, 2);
    assert.equal(reviewCalls, 2);
  });

  it("shares one generation and one review for simultaneous identical requests", async () => {
    const context = { lockedBathroomCount: 2 };
    const results = await Promise.all([
      generateLifeSketch(PNG, { topologyProof: PNG }, context),
      generateLifeSketch(PNG, { topologyProof: PNG }, context),
    ]);
    assert.ok(results.every((result) => result.ok));
    assert.equal(imageCalls, 1);
    assert.equal(reviewCalls, 1);
  });

  it("clears a shared failed generation so the same inputs can be retried", async () => {
    const context = { lockedBathroomCount: 2 };
    topologyVerdict = "fail";
    const results = await Promise.all([
      generateLifeSketch(PNG, { topologyProof: PNG }, context),
      generateLifeSketch(PNG, { topologyProof: PNG }, context),
    ]);
    assert.ok(results.every((result) => !result.ok));
    assert.equal(imageCalls, 1);
    assert.equal(reviewCalls, 1);

    topologyVerdict = "pass";
    assert.equal((await generateLifeSketch(PNG, { topologyProof: PNG }, context)).ok, true);
    assert.equal(imageCalls, 2);
    assert.equal(reviewCalls, 2);
  });

  it("returns the reviewed image when optional cache persistence fails", async () => {
    const invalidCacheDirectory = join(root, "cache-path-is-a-file");
    await writeFile(invalidCacheDirectory, "occupied");
    process.env.SKETCH_CACHE_DIR = invalidCacheDirectory;
    const originalWarn = console.warn;
    const warnings: unknown[][] = [];
    console.warn = (...args: unknown[]) => { warnings.push(args); };
    try {
      const result = await generateLifeSketch(PNG, { topologyProof: PNG }, { lockedBathroomCount: 2 });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.fromCache, false);
        assert.deepEqual(result.png, PNG);
      }
      assert.equal(imageCalls, 1);
      assert.equal(reviewCalls, 1);
      assert.ok(warnings.length > 0);
      assert.doesNotMatch(JSON.stringify(warnings), /sk-test-sketch-validation/);
    } finally {
      console.warn = originalWarn;
    }
  });

  it("persists review sidecars for the local file-provider alias", async () => {
    process.env.SKETCH_CACHE_PROVIDER = "local";
    const context = { lockedBathroomCount: 2 };
    assert.equal((await generateLifeSketch(PNG, { topologyProof: PNG }, context)).ok, true);
    assert.ok((await readdir(root)).some((name) => name.endsWith(".json")));
    delete process.env.OPENAI_API_KEY;
    const result = await generateLifeSketch(PNG, { topologyProof: PNG }, context);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.fromCache, true);
    assert.equal(imageCalls, 1);
    assert.equal(reviewCalls, 1);
  });
});
