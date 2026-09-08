import { expect, test } from "@playwright/test";

test.describe("House Changelog release containment", () => {
  test("withholds a receipt derived from unreviewed geometry", async ({ request }) => {
    const response = await request.post("/api/changelog", { data: {
      templateId: "resale-exec-1990s", placements: [{ tokenId: "wind_gate", point: { x: 12.2, y: 7.7 } }],
    } });
    expect(response.status()).toBe(422);
    const body = await response.json();
    expect(body).toMatchObject({ error: "geometry_not_ready", releaseGate: { eligible: false } });
    expect(body).not.toHaveProperty("lines");
  });

  test("keeps malformed placement errors actionable", async ({ request }) => {
    const response = await request.post("/api/changelog", { data: {
      templateId: "resale-exec-1990s", placements: [{ tokenId: "wind_gate", point: { x: 12.2 } }],
    } });
    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "each placement must include tokenId and point { x, y } in plan meters." });
  });
});
