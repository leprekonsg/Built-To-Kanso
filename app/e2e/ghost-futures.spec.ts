import { expect, test } from "@playwright/test";

test.describe("Ghost Futures release containment", () => {
  test("withholds arrangement futures for unreviewed geometry", async ({ request }) => {
    const response = await request.post("/api/ghost-futures", { data: {
      templateId: "resale-exec-1990s", compassDeg: 260, floor: 11, placements: [],
    } });
    expect(response.status()).toBe(422);
    const body = await response.json();
    expect(body).toMatchObject({ error: "geometry_not_ready", releaseGate: { eligible: false } });
    expect(body).not.toHaveProperty("futures");
  });

  test("keeps malformed placement errors actionable", async ({ request }) => {
    const response = await request.post("/api/ghost-futures", { data: {
      templateId: "resale-exec-1990s", compassDeg: 260, floor: 11,
      placements: [{ tokenId: "wind_gate", point: { x: 12.2 } }], candidates: [],
    } });
    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "each placement must include tokenId and point { x, y } in plan meters." });
  });

  test("does not render comparison lanes in the contained Studio", async ({ page }) => {
    await page.goto("/studio?template=resale-exec-1990s&compass=260&floor=11&scenario=just-moved-in");
    await expect(page.getByTestId("geometry-review-required")).toBeVisible();
    await expect(page.getByText("Ghost Futures", { exact: true })).toHaveCount(0);
  });
});
