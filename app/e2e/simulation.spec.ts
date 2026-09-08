import { expect, test } from "@playwright/test";

test.describe("Simulation release gate", () => {
  test("withholds simulation for unreviewed geometry", async ({ request }) => {
    const response = await request.post("/api/simulation", {
      data: { templateId: "resale-exec-1990s", condition: "ne_monsoon", tokenPlacements: [] },
    });
    expect(response.status()).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: "geometry_not_ready", releaseGate: { eligible: false } });
  });

  test("preserves actionable validation before the release gate", async ({ request }) => {
    const response = await request.post("/api/simulation", { data: { templateId: "not-real", tokenPlacements: [] } });
    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "templateId must be one of: tampines-greenweave, tengah-5room, resale-exec-1990s.",
    });
  });
});
