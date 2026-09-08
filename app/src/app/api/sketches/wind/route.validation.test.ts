import assert from "node:assert/strict";
import { it } from "node:test";
import { POST } from "./route";

it("keeps deterministic streamlines out of Images even when polish is requested", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  let upstreamCalls = 0;
  process.env.OPENAI_API_KEY = "sk-test-wind-validation";
  globalThis.fetch = (async () => {
    upstreamCalls += 1;
    throw new Error("The composed airflow image must never reach an image model.");
  }) as typeof fetch;
  const request = (query: string, accept = "image/svg+xml") => new Request(`https://example.com/api/sketches/wind${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", accept },
    body: JSON.stringify({ templateId: "resale-exec-1990s" }),
  });
  try {
    const plain = await POST(request(""));
    const polished = await POST(request("?polish=1"));
    assert.equal(polished.status, 200);
    assert.match(polished.headers.get("content-type") ?? "", /image\/svg\+xml/);
    const svg = await polished.text();
    assert.equal(svg, await plain.text());
    assert.match(svg, /data-layer="deterministic-streamlines"/);
    assert.equal(polished.headers.get("x-prompt-id"), null);
    assert.equal(upstreamCalls, 0);

    const json = await POST(request("?polish=1", "application/json"));
    assert.match(json.headers.get("content-type") ?? "", /application\/json/);
    assert.equal((await json.json()).contentType, "image/svg+xml");
    assert.equal(upstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});
