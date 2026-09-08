import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { POST } from "./route";

function request(body: unknown, accept = "application/json") {
  return new Request("https://example.com/api/sketches/plan", { method: "POST", headers: { "Content-Type": "application/json", accept }, body: JSON.stringify(body) });
}

describe("Plan Sketch route geometry boundary", () => {
  it("rejects unknown, null, and malformed requests with 400", async () => {
    assert.equal((await POST(request({ templateId: "not-a-template" }))).status, 400);
    assert.equal((await POST(request(null))).status, 400);
    assert.equal((await POST(new Request("https://example.com/api/sketches/plan", { method: "POST", body: "{" }))).status, 400);
  });
  it("blocks presentation output before network access", async () => {
    const originalFetch = globalThis.fetch; let calls = 0;
    globalThis.fetch = (async () => { calls += 1; throw new Error("must not reach provider"); }) as typeof fetch;
    try {
      const response = await POST(request({ templateId: "resale-exec-1990s" }, "image/png"));
      const body = await response.json();
      assert.equal(response.status, 422); assert.equal(body.error, "geometry_not_ready"); assert.equal(body.releaseGate.eligible, false); assert.equal(calls, 0);
    } finally { globalThis.fetch = originalFetch; }
  });
  it("keeps deterministic SVG available as explicitly diagnostic geometry", async () => {
    const response = await POST(request({ templateId: "resale-exec-1990s" }, "image/svg+xml"));
    assert.equal(response.status, 200); assert.equal(response.headers.get("x-geometry-use"), "diagnostic-only"); assert.match(await response.text(), /Topology proof/);
  });
});
