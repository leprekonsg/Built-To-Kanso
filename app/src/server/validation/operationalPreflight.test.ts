import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateOperationalPreflight } from "./operationalPreflight";

describe("operational preflight", () => {
  it("reports demo fallbacks without leaking configured secret values", async () => {
    const result = await evaluateOperationalPreflight(({
      OPENAI_API_KEY: "sk-secret-openai",
      NEA_API_KEY: "nea-secret",
      SKETCH_CACHE_PROVIDER: "memory",
    } as unknown) as NodeJS.ProcessEnv);

    assert.equal(result.okForDemo, true);
    assert.equal(result.requirements.length, 5);
    assert.equal(result.requirements.find((item) => item.id === "openai_api_key")?.sensitive, true);
    assert.equal(result.requirements.find((item) => item.id === "sketch_cache_r2")?.sensitive, false);
    assert.equal(result.checks.find((check) => check.id === "openai_api_key")?.status, "ready");
    assert.equal(result.checks.find((check) => check.id === "nea_api_key")?.status, "ready");
    assert.equal(result.checks.find((check) => check.id === "sketch_cache_r2")?.status, "waived");
    assert.equal(result.checks.find((check) => check.id === "vapid_keypair")?.status, "waived");
    assert.doesNotMatch(JSON.stringify(result), /sk-secret-openai|nea-secret/);
  });

  it("marks missing OpenAI and NEA as demo fallbacks and VAPID as waived", async () => {
    const result = await evaluateOperationalPreflight(({ SKETCH_CACHE_PROVIDER: "memory" } as unknown) as NodeJS.ProcessEnv);

    assert.equal(result.okForDemo, true);
    assert.equal(result.checks.find((check) => check.id === "openai_api_key")?.status, "demo_fallback");
    assert.equal(result.checks.find((check) => check.id === "nea_api_key")?.status, "demo_fallback");
    assert.equal(result.checks.find((check) => check.id === "vapid_keypair")?.status, "waived");
    assert.match(
      result.requirements.find((item) => item.id === "vapid_keypair")?.required ?? "",
      /waived for the demo/,
    );
  });

  it("returns an actionable cache error when the retired R2 provider is selected", async () => {
    const result = await evaluateOperationalPreflight(({ SKETCH_CACHE_PROVIDER: "r2" } as unknown) as NodeJS.ProcessEnv);
    const cache = result.checks.find((check) => check.id === "sketch_cache_r2");

    assert.equal(cache?.status, "not_configured");
    assert.match(cache?.message ?? "", /R2 is out of Phase 1/);
    assert.match(cache?.nextAction ?? "", /memory or file/);
  });

  it("accepts non-secret OpenAI Tier 2 account evidence", async () => {
    const result = await evaluateOperationalPreflight(
      ({ SKETCH_CACHE_PROVIDER: "memory" } as unknown) as NodeJS.ProcessEnv,
      {
        openaiTier2Account: {
          verified: true,
          verifiedAtIso: "2026-05-10T00:00:00.000Z",
          reviewer: "demo-operator",
        },
      },
    );

    const account = result.checks.find((check) => check.id === "openai_tier2_account");
    assert.equal(account?.status, "ready");
    assert.equal(account?.nextAction, null);
    assert.match(account?.message ?? "", /2026-05-10T00:00:00.000Z/);
    assert.doesNotMatch(JSON.stringify(result), /demo-operator/);
  });
});
