import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  clearLifeAnchorByteCache,
  getLifeAnchorCachePath,
} from "@/server/anchors/lifeAnchor";
import { POST } from "./route";

// 1x1 PNG — magic-number-valid bytes used as both a fake anchor and a fake
// OpenAI response. We never decode it; only the prefix is asserted on the
// wire. The route's anchor cache check (isPng) only inspects the prefix.
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==";

interface EnvSnapshot {
  OPENAI_API_KEY: string | undefined;
  LIFE_ANCHOR_CACHE_ROOT: string | undefined;
  SKETCH_CACHE_DIR: string | undefined;
  SKETCH_CACHE_PROVIDER: string | undefined;
}

function snapshotEnv(): EnvSnapshot {
  return {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    LIFE_ANCHOR_CACHE_ROOT: process.env.LIFE_ANCHOR_CACHE_ROOT,
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
    process.env.SKETCH_CACHE_PROVIDER = "file";
    process.env.SKETCH_CACHE_DIR = tempCacheDir;
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
    await writeFile(cachePath.absolutePath, PNG_MAGIC);
    writtenAnchors.push(cachePath.absolutePath);

    let openAICalls = 0;
    globalThis.fetch = (async () => {
      openAICalls += 1;
      return new Response(
        JSON.stringify({ data: [{ b64_json: TINY_PNG_BASE64 }] }),
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
    assert.equal(
      response.headers.get("x-life-anchor-cache-path"),
      "life-anchors/tengah-5room/anchor.png",
    );
    assert.equal(bytes.subarray(0, 8).toString("hex"), PNG_MAGIC.toString("hex"));
    assert.equal(openAICalls, 1);
  });

  it("anchor-only path (no anchor cache, no OpenAI key, Accept svg) returns deterministic anchor SVG", async () => {
    delete process.env.OPENAI_API_KEY;

    const response = await POST(
      postLife({ templateId: "resale-exec-1990s" }, "image/svg+xml"),
    );
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/svg+xml");
    assert.equal(response.headers.get("x-life-anchor-source"), "deterministic-svg");
    assert.equal(response.headers.get("x-sketch-fallback"), "deterministic-anchor-svg");
    assert.equal(response.headers.get("x-evidence-tier"), "prototype_visualisation");
    assert.match(body, /Life Sketch anchor fallback/);
  });

  it("anchor cache present + no OPENAI_API_KEY emits local prebaked anchor PNG", async () => {
    delete process.env.OPENAI_API_KEY;

    const cachePath = getLifeAnchorCachePath("tampines-greenweave");
    await mkdir(cachePath.directory, { recursive: true });
    await writeFile(cachePath.absolutePath, PNG_MAGIC);
    writtenAnchors.push(cachePath.absolutePath);

    const response = await POST(postLife({ templateId: "tampines-greenweave" }));
    const bytes = Buffer.from(await response.arrayBuffer());

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(response.headers.get("x-sketch-fallback"), "local-prebaked-anchor");
    assert.equal(response.headers.get("x-sketch-source"), "local-prebaked-anchor");
    assert.equal(response.headers.get("x-life-anchor-source"), "cache-png");
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
  });

  it("client-supplied anchorPng path stubs OpenAI and returns PNG", async () => {
    process.env.OPENAI_API_KEY = "sk-test";

    let openAICalls = 0;
    globalThis.fetch = (async () => {
      openAICalls += 1;
      return new Response(
        JSON.stringify({ data: [{ b64_json: TINY_PNG_BASE64 }] }),
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
    assert.equal(bytes.subarray(0, 8).toString("hex"), PNG_MAGIC.toString("hex"));
    assert.equal(openAICalls, 1);
  });

  it("non-string anchorPng routes to deterministic anchor fallback (does not 500)", async () => {
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
    assert.equal(response.headers.get("x-sketch-fallback"), "deterministic-anchor-svg");
  });
});
