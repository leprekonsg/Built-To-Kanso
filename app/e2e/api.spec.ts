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

  test("scout pass caps asking points and returns banded Damp Risk with action", async ({ request }) => {
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
    expect(JSON.stringify(body.dampRisk)).not.toContain("predictedRhPct");
    expect(body.dampRisk).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roomId: "main_bedroom",
          band: "high",
          recommendation: expect.stringContaining("Shaft Buffer"),
        }),
      ]),
    );
  });

  test("Shaft Buffer drops the resale master bedroom Damp Risk band to Watch", async ({ request }) => {
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
          band: "watch",
        }),
      ]),
    );
  });

  test("ignores out-of-range Shaft Buffer placements in Scout Pass", async ({ request }) => {
    const response = await request.post("/api/scout", {
      data: {
        templateId: "resale-exec-1990s",
        compassDeg: 260,
        floor: 11,
        tokenPlacements: [{ tokenId: "shaft_buffer", point: { x: 12.2, y: 7.7 } }],
      },
    });

    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.dampRisk).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roomId: "main_bedroom",
          band: "high",
        }),
      ]),
    );
  });

  test("resonance status exposes readiness, Standard thresholds, and push sender status", async ({ request }) => {
    const response = await request.get("/api/resonance/check");
    expect(response.ok()).toBe(true);

    await expect(response.json()).resolves.toMatchObject({
      ready: expect.any(Boolean),
      thresholds: {
        alignmentToleranceDeg: 15,
        minOutdoorSpeedMps: 1.6,
        maxPredictedIndoorSpeedMps: 0.25,
        cooldownHours: 6,
      },
      status: "not_ready",
      pushDispatch: {
        available: false,
        status: "not_configured",
      },
    });
  });

  test("resonance dispatch route supports dry-run without Web Push credentials", async ({ request }) => {
    const response = await request.post("/api/resonance/dispatch", {
      data: {
        dryRun: true,
        floor: 12,
        wind: {
          directionDeg: 180,
          speedMps: 2,
          timestamp: "2026-05-09T06:00:00Z",
          source: "mock",
        },
        plan: {
          schemaVersion: 1,
          templateId: "tampines-greenweave",
          units: "meters",
          source: "architect_curated_template",
          bounds: { x: 0, y: 0, width: 10, height: 10 },
          openingAreaPct: 14,
          westSunFacadeDeg: 270,
          defaultDoorFacingDeg: 0,
          rooms: [],
          openings: [
            {
              id: "op-north",
              kind: "window",
              roomIds: ["room-a"],
              start: { x: 5, y: 0 },
              end: { x: 5, y: 0 },
              operable: true,
            },
            {
              id: "op-south",
              kind: "window",
              roomIds: ["room-a"],
              start: { x: 5, y: 10 },
              end: { x: 5, y: 10 },
              operable: true,
            },
          ],
          fixedElements: [],
          pipeshaft: {
            id: "shaft-1",
            roomId: "room-a",
            openingPoint: { x: 0, y: 0 },
            openingDirectionDeg: 0,
            jetVelocityMps: [0, 0],
            bufferRadiusM: 0,
            downwindRoomIds: [],
          },
          bathrooms: [],
        },
      },
    });

    expect(response.ok()).toBe(true);
    await expect(response.json()).resolves.toMatchObject({
      dispatch: {
        status: "dry_run",
        attempted: false,
        senderStatus: { status: "not_configured" },
        payload: {
          title: "Resonance Hours",
          body: "Your home is breathing right now.",
          tag: "resonance-hours",
        },
      },
    });
  });
});
