import { expect, test } from "@playwright/test";

test.describe("Scout rule outputs", () => {
  test("opening area badge recommends Fan Anchor below 12 percent", async ({ request }) => {
    const response = await request.post("/api/scout", {
      data: {
        templateId: "resale-exec-1990s",
        compassDeg: 315,
        floor: 11,
        tokenPlacements: [],
      },
    });

    expect(response.ok()).toBe(true);
    const body = await response.json();

    expect(body.openingAreaBadge).toMatchObject({
      areaPct: 9,
      status: "marginal",
      recommendedTokenId: "fan_anchor",
    });
    expect(body.askingPoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "breath-opening-marginal",
          recommendation: expect.stringContaining("Fan Anchor"),
        }),
      ]),
    );
  });

  test("opening area badge recommends Wind Gate at 12 percent and above", async ({ request }) => {
    const response = await request.post("/api/scout", {
      data: {
        templateId: "tampines-greenweave",
        compassDeg: 90,
        floor: 8,
        tokenPlacements: [],
      },
    });

    expect(response.ok()).toBe(true);
    const body = await response.json();

    expect(body.openingAreaBadge).toMatchObject({
      areaPct: 14,
      status: "capable",
      recommendedTokenId: "wind_gate",
    });
  });

  test("bathroom downwind rule adds calm recommendation from compass and bathroom geometry", async ({ request }) => {
    const response = await request.post("/api/scout", {
      data: {
        templateId: "resale-exec-1990s",
        compassDeg: 315,
        floor: 11,
        tokenPlacements: [],
      },
    });

    expect(response.ok()).toBe(true);
    const body = await response.json();
    const downwindPoint = body.askingPoints.find((point: { id: string }) =>
      point.id.startsWith("bathroom-downwind-"),
    );

    expect(body.askingPoints.length).toBeLessThanOrEqual(3);
    expect(downwindPoint).toMatchObject({
      scout: "breath",
      copy: "Bathroom air path may drift toward a bedroom.",
      recommendation: expect.stringContaining("bathroom exhaust"),
    });
    expect(`${downwindPoint.copy} ${downwindPoint.designerDetail}`).not.toMatch(/severity|scanner/i);
  });

  test("damp risk readings always include recommendations", async ({ request }) => {
    const response = await request.post("/api/scout", {
      data: {
        templateId: "tengah-5room",
        compassDeg: 225,
        floor: 12,
        tokenPlacements: [],
      },
    });

    expect(response.ok()).toBe(true);
    const body = await response.json();

    expect(body.askingPoints.length).toBeLessThanOrEqual(3);
    for (const reading of body.dampRisk) {
      expect(reading).toEqual(
        expect.objectContaining({
          predictedRhPct: expect.any(Number),
          recommendation: expect.any(String),
        }),
      );
      expect(reading.recommendation.length).toBeGreaterThan(0);
    }
  });
});
