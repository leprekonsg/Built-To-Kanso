import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { POST } from "./route";

function request(body: unknown, materialize = false) {
  return new Request(`https://example.com/api/sketches/resonance-hour${materialize ? "?materialize=1" : ""}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

describe("Resonance Hour geometry boundary", () => {
  it("rejects unknown, null, and malformed requests with 400", async () => {
    assert.equal((await POST(request({ templateId: "unknown" }))).status, 400); assert.equal((await POST(request(null))).status, 400);
    assert.equal((await POST(new Request("https://example.com/api/sketches/resonance-hour", { method: "POST", body: "{" }))).status, 400);
  });
  it("blocks cached delivery and explicit materialization before provider access", async () => {
    const originalFetch = globalThis.fetch; let calls = 0;
    globalThis.fetch = (async () => { calls += 1; throw new Error("must not reach provider"); }) as typeof fetch;
    try {
      for (const materialize of [false, true]) { const response = await POST(request({ templateId: "resale-exec-1990s" }, materialize)); const body = await response.json(); assert.equal(response.status, 422); assert.equal(body.error, "geometry_not_ready"); assert.equal(body.releaseGate.eligible, false); }
      assert.equal(calls, 0);
    } finally { globalThis.fetch = originalFetch; }
  });
});
