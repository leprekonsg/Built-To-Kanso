import { expect, test } from "@playwright/test";

test.describe("Scout release containment", () => {
  test("withholds recommendations and damp readings for unreviewed geometry", async ({ request }) => {
    const response = await request.post("/api/scout", { data: {
      templateId: "resale-exec-1990s", compassDeg: 315, floor: 11, tokenPlacements: [],
    } });
    expect(response.status()).toBe(422);
    const body = await response.json();
    expect(body).toMatchObject({ error: "geometry_not_ready", releaseGate: { eligible: false } });
    expect(body).not.toHaveProperty("askingPoints");
    expect(body).not.toHaveProperty("dampRisk");
  });

  test("validates malformed inputs before containment", async ({ request }) => {
    const response = await request.post("/api/scout", { data: { templateId: "not-real" } });
    expect(response.status()).toBe(400);
  });
});
