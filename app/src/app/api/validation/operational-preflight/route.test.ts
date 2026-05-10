import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GET, POST } from "./route";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/validation/operational-preflight", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/validation/operational-preflight", () => {
  it("returns demo-safe operational status without secret values", async () => {
    const previousOpenAI = process.env.OPENAI_API_KEY;
    const previousNea = process.env.NEA_API_KEY;
    process.env.OPENAI_API_KEY = "sk-secret-route";
    process.env.NEA_API_KEY = "nea-secret-route";

    try {
      const response = await GET();
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.okForDemo, true);
      assert.equal(body.checks.length, 5);
      assert.equal(body.requirements.length, 5);
      assert.equal(
        body.requirements.find((item: { id: string }) => item.id === "openai_api_key").sensitive,
        true,
      );
      assert.doesNotMatch(JSON.stringify(body), /sk-secret-route|nea-secret-route/);
    } finally {
      restoreEnv("OPENAI_API_KEY", previousOpenAI);
      restoreEnv("NEA_API_KEY", previousNea);
    }
  });

  it("evaluates non-secret operational evidence without leaking reviewer notes", async () => {
    const response = await POST(jsonRequest({
      operationalEvidence: {
        openaiTier2Account: {
          verified: true,
          verifiedAtIso: "2026-05-10T00:00:00.000Z",
          reviewer: "demo-operator",
        },
      },
    }));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.checks.find((check: { id: string }) => check.id === "openai_tier2_account").status, "ready");
    assert.doesNotMatch(JSON.stringify(body), /demo-operator/);
  });

  it("rejects malformed operational evidence payloads", async () => {
    const response = await POST(jsonRequest({ operationalEvidence: [] }));
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.error, /operationalEvidence must be an object/);
  });
});

function restoreEnv(name: "OPENAI_API_KEY" | "NEA_API_KEY", value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
