import { test, expect } from "@playwright/test";

test("unreleased public cache files cannot bypass the output boundary", async ({ request }) => {
  for (const path of [
    "/plan-sketches/tampines-greenweave/plan.png",
    "/life-anchors/tengah-5room/anchor.png",
    "/life-sketches/tampines-greenweave/accepted.png",
    "/wind-base/tampines-greenweave/base.png",
    "/resonance-hour/resale-exec-1990s/accepted.png",
    "/resonance-hour/tampines-greenweave/accepted.json",
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(422);
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect((await response.json()).error).toBe("geometry_not_ready");
  }
});
