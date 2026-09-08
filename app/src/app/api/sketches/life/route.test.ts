import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { POST } from "./route";

function request(body: unknown, url = "https://example.com/api/sketches/life", accept = "application/json") {
  return new Request(url, { method: "POST", headers: { "Content-Type": "application/json", accept }, body: JSON.stringify(body) });
}

describe("Life Sketch route geometry boundary", () => {
  it("rejects unknown, null, and malformed requests with 400", async () => {
    assert.equal((await POST(request({ templateId: "unknown" }))).status, 400);
    assert.equal((await POST(request(null))).status, 400);
    assert.equal((await POST(new Request("https://example.com/api/sketches/life", { method: "POST", body: "{" }))).status, 400);
  });
  it("allows only the explicit deterministic anchor diagnostic", async () => {
    const response = await POST(request({ templateId: "resale-exec-1990s" }, "https://example.com/api/sketches/life?anchor=1", "image/svg+xml"));
    assert.equal(response.status, 200); assert.equal(response.headers.get("content-type"), "image/svg+xml");
    assert.equal(response.headers.get("x-life-anchor-source"), "deterministic-svg"); assert.match(await response.text(), /camera-view greybox anchor/);
  });
  it("blocks cached generation and client-supplied anchors before provider access", async () => {
    const originalFetch = globalThis.fetch; let calls = 0;
    globalThis.fetch = (async () => { calls += 1; throw new Error("must not reach provider"); }) as typeof fetch;
    try {
      for (const body of [{ templateId: "resale-exec-1990s" }, { templateId: "resale-exec-1990s", anchorPng: "iVBORw0KGgo=" }]) {
        const response = await POST(request(body, undefined, "image/png")); const payload = await response.json();
        assert.equal(response.status, 422); assert.equal(payload.error, "geometry_not_ready"); assert.equal(payload.releaseGate.eligible, false);
      }
      assert.equal(calls, 0);
    } finally { globalThis.fetch = originalFetch; }
  });
});
