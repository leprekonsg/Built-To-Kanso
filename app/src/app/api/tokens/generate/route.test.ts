import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import { GET, POST } from "./route";

describe("/api/tokens/generate", () => {
  it("reports local token-visual provider health without exposing keys", async () => {
    const response = await GET();
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-token-visual-only"), "true");
    assert.equal(body.visualOnly, true);
    assert.equal(body.providers["local-demo"].configured, true);
    assert.equal(JSON.stringify(body).includes("API_KEY"), false);
  });

  it("generates a local visual-only GLB response for a token", async () => {
    const dir = await mkdtemp(join(tmpdir(), "btk-token-route-"));
    const previousCache = process.env.TOKEN_3D_CACHE_DIR;
    const previousProvider = process.env.TOKEN_3D_PROVIDER;
    try {
      process.env.TOKEN_3D_CACHE_DIR = dir;
      process.env.TOKEN_3D_PROVIDER = "local-demo";
      const response = await POST(new Request("https://example.com/api/tokens/generate", {
        method: "POST",
        body: JSON.stringify({ tokenId: "shaft_buffer", variant: "tropical_modernist" }),
      }));
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-evidence-tier"), "prototype_visualisation");
      assert.equal(response.headers.get("x-token-visual-only"), "true");
      assert.equal(response.headers.get("x-token-visual-provider"), "local-demo");
      assert.equal(body.visualOnly, true);
      assert.equal(body.provider, "local-demo");
      assert.match(body.modelUrl, /^\/api\/tokens\/model\/token-shaft_buffer-tropical_modernist-local-demo\.glb$/);
      assert.match(body.disclaimer, /plan-geometry\.json/);
    } finally {
      if (previousCache === undefined) delete process.env.TOKEN_3D_CACHE_DIR;
      else process.env.TOKEN_3D_CACHE_DIR = previousCache;
      if (previousProvider === undefined) delete process.env.TOKEN_3D_PROVIDER;
      else process.env.TOKEN_3D_PROVIDER = previousProvider;
      await rm(dir, { recursive: true, force: true });
    }
  });
});
