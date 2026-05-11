import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import {
  buildTokenVisualPrompt,
  normalizeTokenVisualRequest,
  providerPlan,
  readTokenVisualModel,
  resolveTokenVisual,
  tokenVisualHealth,
} from "./visuals";

describe("token visual GLB pipeline", () => {
  it("keeps provider fallback local-safe", () => {
    assert.deepEqual(providerPlan("auto"), ["tripo", "hunyuan", "local-demo"]);
    assert.deepEqual(providerPlan("local-demo"), ["local-demo"]);
    assert.equal(tokenVisualHealth({}).providers["local-demo"].configured, true);
  });

  it("builds token prompts as visual-only assets, not compliance truth", () => {
    const prompt = buildTokenVisualPrompt("shaft_buffer", "japandi");

    assert.match(prompt, /visual token asset only/);
    assert.match(prompt, /not room geometry/);
    assert.match(prompt, /not compliance evidence/);
    assert.match(prompt, /Do not infer or set placement, dimensions, clearance, airflow effect, Damp Risk/);
    assert.match(prompt, /plan-geometry\.json/);
    assert.match(prompt, /Pale oak, rattan, warm plaster, humid restraint/);
    assert.match(prompt, /no plastic-AI-render sheen/);
    assert.match(prompt, /no HDR clarity/);
  });

  it("validates incoming token visual requests", () => {
    assert.deepEqual(normalizeTokenVisualRequest({ tokenId: "wind_gate" }), {
      tokenId: "wind_gate",
      variant: "japandi",
      provider: "auto",
    });
    assert.equal(
      normalizeTokenVisualRequest({ tokenId: "bad" }),
      "tokenId must be one of: wind_gate, soft_screen, wood_anchor, solar_shield, fan_anchor, shaft_buffer.",
    );
    assert.equal(
      normalizeTokenVisualRequest({ tokenId: "wind_gate", provider: "r2" }),
      "provider must be one of: auto, local-demo, tripo, hunyuan.",
    );
  });

  it("falls back to a cached local demo GLB when providers are not configured", async () => {
    const dir = await mkdtemp(join(tmpdir(), "btk-token-visuals-"));
    try {
      const env = {
        TOKEN_3D_CACHE_DIR: dir,
        TOKEN_3D_PROVIDER: "auto",
        TOKEN_3D_POLL_TIMEOUT_MS: "1",
        TOKEN_3D_POLL_INTERVAL_MS: "1",
      };
      const result = await resolveTokenVisual({ tokenId: "wood_anchor", variant: "wabi_sabi", provider: "auto" }, env);

      assert.equal(result.provider, "local-demo");
      assert.equal(result.visualOnly, true);
      assert.equal(result.tier, "prototype_visualisation");
      assert.match(result.modelUrl, /^\/api\/tokens\/model\/token-wood_anchor-wabi_sabi-local-demo\.glb$/);
      assert.ok(result.attempts.some((attempt) => attempt.provider === "tripo" && attempt.status === "unavailable"));
      assert.ok(result.attempts.some((attempt) => attempt.provider === "hunyuan" && attempt.status === "unavailable"));

      const file = result.modelUrl.split("/").at(-1);
      assert.ok(file);
      const model = await readTokenVisualModel(file, env);
      assert.ok(model);
      assert.equal(model.toString("utf8", 0, 4), "glTF");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
