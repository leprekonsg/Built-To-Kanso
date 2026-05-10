import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { hashBytes } from "@/lib/imageHash";
import { getPlanGeometry } from "@/server/geometry/registry";
import { keyFor, putCached } from "@/server/openai/cache";
import { renderPlanSketchFallbackSvg } from "@/server/openai/fallbackSvg";
import { rasterizeSvgToPng } from "@/server/openai/svgRaster";
import { getPlanSketchCachePath } from "@/server/sketches/planSketchAsset";
import { POST } from "./route";

// Minimal valid PNG (1x1) used as a stand-in for OpenAI/cache responses. We
// never decode it; only the magic-number prefix is asserted on the wire.
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==";
const TINY_PNG = Buffer.from(TINY_PNG_BASE64, "base64");

interface EnvSnapshot {
  OPENAI_API_KEY: string | undefined;
  PLAN_SKETCH_CACHE_ROOT: string | undefined;
  SKETCH_CACHE_DIR: string | undefined;
  SKETCH_CACHE_PROVIDER: string | undefined;
}

function snapshotEnv(): EnvSnapshot {
  return {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
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

function postPlan(templateId: string, accept?: string): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accept) headers.accept = accept;
  return new Request("https://example.com/api/sketches/plan", {
    method: "POST",
    headers,
    body: JSON.stringify({ templateId }),
  });
}

async function planCacheKeyFor(templateId: "tampines-greenweave" | "tengah-5room" | "resale-exec-1990s"): Promise<string> {
  const plan = getPlanGeometry(templateId);
  const svg = renderPlanSketchFallbackSvg(plan);
  const raster = await rasterizeSvgToPng(svg);
  if (!raster.ok) throw new Error(`rasterizer unavailable in test env: ${raster.message}`);
  return keyFor("plan-sketch-style-transfer", { imageHashes: [hashBytes(raster.png)] });
}

describe("Plan Sketch route", () => {
  let tempDir: string;
  let envSnap: EnvSnapshot;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    envSnap = snapshotEnv();
    originalFetch = globalThis.fetch;
    tempDir = await mkdtemp(join(tmpdir(), "btk-plan-route-"));
    process.env.PLAN_SKETCH_CACHE_ROOT = tempDir;
    process.env.SKETCH_CACHE_PROVIDER = "file";
    process.env.SKETCH_CACHE_DIR = tempDir;
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    restoreEnv(envSnap);
    await rm(tempDir, { recursive: true, force: true });
  });

  it("rejects unknown templateId with 400", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const response = await POST(postPlan("not-a-template"));
    assert.equal(response.status, 400);
  });

  it("serves cache-hit PNG with X-From-Cache: true and prototype evidence tier", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const key = await planCacheKeyFor("tengah-5room");
    await putCached(key, TINY_PNG, tempDir);

    // Fail the test loudly if the route ever reaches OpenAI on a cache hit.
    globalThis.fetch = (async () => {
      throw new Error("fetch must not be called on cache hit");
    }) as typeof fetch;

    const response = await POST(postPlan("tengah-5room"));
    const bytes = Buffer.from(await response.arrayBuffer());

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(response.headers.get("x-from-cache"), "true");
    assert.equal(response.headers.get("x-evidence-tier"), "prototype_visualisation");
    assert.equal(response.headers.get("x-prompt-id"), "plan-sketch-style-transfer");
    assert.equal(Buffer.compare(bytes, TINY_PNG), 0);
  });

  it("serves local prebaked Plan Sketch PNG before OpenAI", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const cache = getPlanSketchCachePath("resale-exec-1990s");
    await mkdir(cache.directory, { recursive: true });
    await writeFile(cache.absolutePath, TINY_PNG);

    globalThis.fetch = (async () => {
      throw new Error("fetch must not be called when local Plan Sketch exists");
    }) as typeof fetch;

    const response = await POST(postPlan("resale-exec-1990s"));
    const bytes = Buffer.from(await response.arrayBuffer());

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(response.headers.get("x-from-cache"), "true");
    assert.equal(response.headers.get("x-sketch-source"), "local-prebaked");
    assert.equal(response.headers.get("x-plan-sketch-cache-path"), "plan-sketches/resale-exec-1990s/plan.png");
    assert.equal(Buffer.compare(bytes, TINY_PNG), 0);
  });

  it("calls OpenAI on cache miss and writes through to cache", async () => {
    process.env.OPENAI_API_KEY = "sk-test";

    let callCount = 0;
    globalThis.fetch = (async () => {
      callCount += 1;
      return new Response(
        JSON.stringify({ data: [{ b64_json: TINY_PNG_BASE64 }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const first = await POST(postPlan("tampines-greenweave"));
    const firstBytes = Buffer.from(await first.arrayBuffer());

    assert.equal(first.status, 200);
    assert.equal(first.headers.get("content-type"), "image/png");
    assert.equal(first.headers.get("x-from-cache"), "false");
    assert.equal(firstBytes.subarray(0, 8).toString("hex"), PNG_MAGIC.toString("hex"));
    assert.equal(callCount, 1);

    // Second call must come from cache; OpenAI fetch should not be hit again.
    const second = await POST(postPlan("tampines-greenweave"));
    assert.equal(second.headers.get("x-from-cache"), "true");
    assert.equal(callCount, 1);
  });

  it("falls back to deterministic SVG on no-key + no-cache (default Accept)", async () => {
    delete process.env.OPENAI_API_KEY;

    const response = await POST(postPlan("resale-exec-1990s"));
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/svg+xml");
    assert.equal(response.headers.get("x-sketch-fallback"), "deterministic-svg");
    assert.equal(response.headers.get("x-evidence-tier"), "prototype_visualisation");
    // Prompt-Id is surfaced via the no_cached_no_key fall-through branch.
    assert.equal(response.headers.get("x-prompt-id"), "plan-sketch-style-transfer");
    assert.match(body, /Plan Sketch fallback/);
  });

  it("returns JSON wrapper when Accept: application/json on fallback", async () => {
    delete process.env.OPENAI_API_KEY;

    const response = await POST(postPlan("resale-exec-1990s", "application/json"));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.fallback, true);
    assert.equal(body.contentType, "image/svg+xml");
    assert.equal(body.tier, "prototype_visualisation");
    assert.equal(body.reason, "png_or_openai_unavailable");
    assert.match(body.nextAction, /OPENAI_API_KEY|image\/svg\+xml|@resvg\/resvg-js/);
  });

  it("falls through to calm SVG fallback on OpenAI 500 (no 5xx surfaced)", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { message: "upstream boom" } }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

    const response = await POST(postPlan("tengah-5room"));
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/svg+xml");
    assert.equal(response.headers.get("x-sketch-fallback"), "openai-error");
    assert.equal(response.headers.get("x-prompt-id"), "plan-sketch-style-transfer");
    assert.equal(response.headers.get("x-evidence-tier"), "prototype_visualisation");
    assert.match(body, /Plan Sketch fallback/);
  });

  it("falls through to calm SVG fallback on OpenAI timeout", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_TIMEOUT_MS = "20";
    globalThis.fetch = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      })) as typeof fetch;

    try {
      const response = await POST(postPlan("tampines-greenweave"));
      const body = await response.text();

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "image/svg+xml");
      assert.equal(response.headers.get("x-sketch-fallback"), "openai-timeout");
      assert.equal(response.headers.get("x-prompt-id"), "plan-sketch-style-transfer");
      assert.match(body, /Plan Sketch fallback/);
    } finally {
      delete process.env.OPENAI_TIMEOUT_MS;
    }
  });

  it("cache key is per-template (different templateId is a fresh miss)", async () => {
    process.env.OPENAI_API_KEY = "sk-test";

    const calls: string[] = [];
    globalThis.fetch = (async (url) => {
      calls.push(String(url));
      return new Response(
        JSON.stringify({ data: [{ b64_json: TINY_PNG_BASE64 }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    // First template miss.
    const a1 = await POST(postPlan("tampines-greenweave"));
    assert.equal(a1.headers.get("x-from-cache"), "false");
    // Same template hit.
    const a2 = await POST(postPlan("tampines-greenweave"));
    assert.equal(a2.headers.get("x-from-cache"), "true");
    // Different template = fresh miss.
    const b1 = await POST(postPlan("tengah-5room"));
    assert.equal(b1.headers.get("x-from-cache"), "false");

    assert.equal(calls.length, 2);
  });
});
