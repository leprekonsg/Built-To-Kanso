import { expect, test } from "@playwright/test";

test.describe("Backend route contracts", () => {
  test("serves source geometry for diagnostic inspection", async ({ request }) => {
    const response = await request.get("/api/templates/resale-exec-1990s/geometry");
    expect(response.ok()).toBe(true);
    await expect(response.json()).resolves.toMatchObject({ schemaVersion: 1, templateId: "resale-exec-1990s" });
  });

  test("returns an actionable error for unknown template geometry", async ({ request }) => {
    const response = await request.get("/api/templates/not-real/geometry");
    expect(response.status()).toBe(404);
    expect((await response.json()).error).toContain("Use one of:");
  });

  test("withholds token validation and Scout advice until geometry review", async ({ request }) => {
    const responses = await Promise.all([
      request.post("/api/tokens/validate", { data: {
        templateId: "resale-exec-1990s", placement: { tokenId: "wood_anchor", point: { x: 13.3, y: 7.4 } },
      } }),
      request.post("/api/scout", { data: {
        templateId: "resale-exec-1990s", compassDeg: 260, floor: 11, tokenPlacements: [],
      } }),
    ]);
    for (const response of responses) {
      expect(response.status()).toBe(422);
      await expect(response.json()).resolves.toMatchObject({ error: "geometry_not_ready", releaseGate: { eligible: false } });
    }
  });

  test("resonance status remains available without making a home claim", async ({ request }) => {
    const response = await request.get("/api/resonance/check");
    expect(response.ok()).toBe(true);
    await expect(response.json()).resolves.toMatchObject({
      status: "not_ready",
      pushDispatch: { available: false, status: "not_configured" },
    });
  });

  test("withholds template-specific resonance checks and dispatch", async ({ request }) => {
    const plan = await (await request.get("/api/templates/resale-exec-1990s/geometry")).json();
    const check = await request.post("/api/resonance/check", { data: { plan, floor: 12 } });
    const dispatch = await request.post("/api/resonance/dispatch", { data: {
      dryRun: true, plan, floor: 12,
      wind: { directionDeg: 180, speedMps: 2, timestamp: "2026-05-09T06:00:00Z", source: "mock" },
    } });
    expect(check.status()).toBe(422);
    expect(dispatch.status()).toBe(422);
    await expect(check.json()).resolves.toMatchObject({ error: "geometry_not_ready" });
    await expect(dispatch.json()).resolves.toMatchObject({ error: "geometry_not_ready" });
  });

  test("kill-signal feed still evaluates tester feedback", async ({ request }) => {
    const response = await request.post("/api/validation/kill-signals", { data: {
      source: "user_study",
      feedback: [
        { userId: "u1", text: "I mostly remember the render." },
        { userId: "u2", text: "I did not notice the Black-state rule." },
        { userId: "u3", text: "I do not remember bathroom downwind protection." },
        { userId: "u4", text: "The evidence tier was clear." },
        { userId: "u5", text: "The plan stayed locked." },
      ],
    } });
    expect(response.ok()).toBe(true);
    await expect(response.json()).resolves.toMatchObject({ ok: true, trippedCount: 1 });
  });

  test("operational preflight does not expose secrets", async ({ request }) => {
    const response = await request.get("/api/validation/operational-preflight");
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.checks).toEqual(expect.arrayContaining([expect.objectContaining({ id: "openai_tier2_account", status: "external" })]));
    expect(JSON.stringify(body)).not.toMatch(/sk-[A-Za-z0-9]/);
  });

  test("readiness scopes blockers to the selected layout while other templates remain contained", async ({ request }) => {
    const response = await request.get("/api/validation/phase1-readiness");
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body).toMatchObject({ complete: false, demoReady: false, repoImplementationComplete: true });
    expect(body.releaseManifest.entries).toEqual([
      { templateId: "tampines-greenweave", capabilities: ["layout_display"], outputs: ["plan_svg"] },
    ]);
    expect(body.demoBlockers).toEqual([expect.stringContaining("geometry_review:tampines-greenweave")]);
    expect(body.renderAssets.ok).toBe(false);
    for (const templateId of ["tengah-5room", "resale-exec-1990s"]) {
      const simulation = await request.post("/api/simulation", { data: { templateId } });
      expect(simulation.status()).toBe(422);
      expect((await simulation.json()).error).toBe("geometry_not_ready");
    }
  });
});
