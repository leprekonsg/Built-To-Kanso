import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { POST } from "./route";

function request(body: unknown, query = "") {
  return new Request(`https://example.com/api/sketches/wind${query}`, { method: "POST", headers: { "Content-Type": "application/json", accept: "image/svg+xml" }, body: JSON.stringify(body) });
}

describe("Wind Sketch geometry boundary", () => {
  it("rejects null, unknown, and malformed requests with 400", async () => {
    assert.equal((await POST(request(null))).status, 400); assert.equal((await POST(request({ templateId: "unknown" }))).status, 400);
    assert.equal((await POST(new Request("https://example.com/api/sketches/wind", { method: "POST", body: "{" }))).status, 400);
  });
  it("blocks plain and polish output before any provider call", async () => {
    const originalFetch = globalThis.fetch; let calls = 0;
    globalThis.fetch = (async () => { calls += 1; throw new Error("must not reach provider"); }) as typeof fetch;
    try {
      for (const query of ["", "?polish=1"]) { const response = await POST(request({ templateId: "resale-exec-1990s" }, query)); assert.equal(response.status, 422); assert.equal((await response.json()).error, "geometry_not_ready"); }
      assert.equal(calls, 0);
    } finally { globalThis.fetch = originalFetch; }
  });
});
