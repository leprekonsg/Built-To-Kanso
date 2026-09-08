import assert from "node:assert/strict";
import { test } from "node:test";
import { POST as simulate } from "@/app/api/simulation/route";
import { POST as scout } from "@/app/api/scout/route";
import { POST as ghost } from "@/app/api/ghost-futures/route";
import { POST as changelog } from "@/app/api/changelog/route";
import { POST as token } from "@/app/api/tokens/validate/route";
import { POST as life } from "@/app/api/sketches/life/route";
import { POST as plan } from "@/app/api/sketches/plan/route";
import { POST as wind } from "@/app/api/sketches/wind/route";
import { POST as windBase } from "@/app/api/sketches/wind-base/route";
import { POST as resonance } from "@/app/api/sketches/resonance-hour/route";

const handlers = { simulate, scout, ghost, changelog, token, life, plan, wind, windBase, resonance };
const input = {
  templateId: "tampines-greenweave", compassDeg: 255, floor: 11,
  placements: [], tokenPlacements: [],
  placement: { tokenId: "wind_gate", point: { x: 7, y: 2 } },
};

test("known-invalid geometry cannot reach advice, simulation or image providers", async () => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("No provider call is permitted for invalid geometry"); };
  try {
    for (const [name, handler] of Object.entries(handlers)) {
      const response = await handler(new Request(`http://localhost/${name}?materialize=1`, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "image/png" },
        body: JSON.stringify(input),
      }));
      assert.equal(response.status, 422, name);
      const payload = await response.json();
      assert.equal(payload.error, "geometry_not_ready", name);
      assert.equal(payload.releaseGate.eligible, false, name);
      assert.equal(response.headers.get("Cache-Control"), "no-store", name);
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = previousFetch; }
});

test("diagnostic plan remains inspectable without generating a presentation asset", async () => {
  const response = await plan(new Request("http://localhost/plan", {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "image/svg+xml" },
    body: JSON.stringify(input),
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Geometry-Use"), "diagnostic-only");
  assert.match(await response.text(), /<svg/);
});

test("malformed or null advice bodies produce actionable client errors", async () => {
  for (const handler of [scout, ghost, changelog, token, wind]) {
    for (const body of ["null", "{"]) {
      const response = await handler(new Request("http://localhost/api", { method: "POST", body }));
      assert.equal(response.status, 400);
    }
  }
});
