import { expect, test } from "@playwright/test";

test.describe("Backend route contracts", () => {
  test("serves validated template geometry", async ({ request }) => {
    const response = await request.get("/api/templates/resale-exec-1990s/geometry");
    expect(response.ok()).toBe(true);

    const geometry = await response.json();
    expect(geometry.schemaVersion).toBe(1);
    expect(geometry.templateId).toBe("resale-exec-1990s");
    expect(geometry.openingAreaPct).toBe(9);
    expect(geometry.fixedElements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "household_shelter", confidence: "black" }),
        expect.objectContaining({ kind: "pipeshaft_opening", confidence: "black", bufferEligible: true }),
      ]),
    );
  });

  test("returns actionable error for unknown template geometry", async ({ request }) => {
    const response = await request.get("/api/templates/not-real/geometry");
    expect(response.status()).toBe(404);

    const body = await response.json();
    expect(body.error).toContain("Use one of:");
  });

  test("blocks non-invasive tokens on Black-state elements", async ({ request }) => {
    const response = await request.post("/api/tokens/validate", {
      data: {
        templateId: "resale-exec-1990s",
        placement: { tokenId: "wood_anchor", point: { x: 13.3, y: 7.4 } },
      },
    });

    expect(response.ok()).toBe(true);
    await expect(response.json()).resolves.toMatchObject({
      allowed: false,
      code: "black_state_blocked",
    });
  });

  test("allows Shaft Buffer within the pipeshaft radius", async ({ request }) => {
    const response = await request.post("/api/tokens/validate", {
      data: {
        templateId: "resale-exec-1990s",
        placement: { tokenId: "shaft_buffer", point: { x: 5.4, y: 3.95 } },
      },
    });

    expect(response.ok()).toBe(true);
    await expect(response.json()).resolves.toMatchObject({
      allowed: true,
      code: "ok",
    });
  });

  test("scout pass caps asking points and pairs Damp Risk with action", async ({ request }) => {
    const response = await request.post("/api/scout", {
      data: {
        templateId: "resale-exec-1990s",
        compassDeg: 260,
        floor: 11,
        tokenPlacements: [],
      },
    });

    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.askingPoints.length).toBeLessThanOrEqual(3);
    expect(body.dampRisk).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roomId: "main_bedroom",
          predictedRhPct: 78,
          flag: "high",
          recommendation: expect.stringContaining("Shaft Buffer"),
        }),
      ]),
    );
  });

  test("Shaft Buffer clears the resale master bedroom Damp Risk flag", async ({ request }) => {
    const response = await request.post("/api/scout", {
      data: {
        templateId: "resale-exec-1990s",
        compassDeg: 260,
        floor: 11,
        tokenPlacements: [{ tokenId: "shaft_buffer", point: { x: 5.4, y: 3.95 } }],
      },
    });

    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.dampRisk).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roomId: "main_bedroom",
          predictedRhPct: 73,
          flag: "clear",
        }),
      ]),
    );
  });
});
