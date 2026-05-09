import { expect, test } from "@playwright/test";

test.describe("Tier 4 simulation API", () => {
  test("returns deterministic pre-baked field output", async ({ request }) => {
    const payload = {
      templateId: "resale-exec-1990s",
      tokenPlacements: [{ tokenId: "shaft_buffer", point: { x: 5.4, y: 3.95 } }],
    };

    const first = await request.post("/api/simulation", { data: payload });
    const second = await request.post("/api/simulation", { data: payload });

    expect(first.ok()).toBe(true);
    expect(second.ok()).toBe(true);

    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(firstBody).toEqual(secondBody);
    expect(firstBody).toMatchObject({
      templateId: "resale-exec-1990s",
      source: "tier4_prebaked",
      tier: "prototype_visualisation",
      materialPreset: "monsoon_atelier_default",
      materialDefaults: {
        streamlines: {
          sumiInk: "#111111",
          silkRibbon: "#E5C37A",
        },
        particles: {
          cleanAir: "#D8A24A",
          pipeshaft: "#A79F93",
        },
        visibility: {
          minOpacity: 0.28,
          maxOpacity: 0.94,
        },
      },
      resolution: { width: 14.4, height: 10.2, units: "meters", sampleStepM: 1.2 },
    });
    expect(firstBody.streamlines).toHaveLength(3);
    expect(firstBody.particles).toHaveLength(4);
    expect(firstBody.velocitySamples).toHaveLength(4);
    expect(firstBody.streamlines.map((line: any) => line.material)).toEqual([
      "silk_ribbon",
      "silk_ribbon",
      "sumi_ink",
    ]);
    expect(firstBody.particles.map((particle: any) => particle.kind)).toEqual([
      "clean_air",
      "clean_air",
      "clean_air",
      "pipeshaft_drift",
    ]);
    expect(firstBody.particles.map((particle: any) => particle.material)).toEqual([
      "sunlit_dust",
      "sunlit_dust",
      "sunlit_dust",
      "hdb_concrete_dust",
    ]);
  });

  test("only valid Shaft Buffer placements deflect the pipeshaft field", async ({ request }) => {
    const basePayload = { templateId: "resale-exec-1990s" };
    const none = await request.post("/api/simulation", {
      data: { ...basePayload, tokenPlacements: [] },
    });
    const invalid = await request.post("/api/simulation", {
      data: {
        ...basePayload,
        tokenPlacements: [{ tokenId: "shaft_buffer", point: { x: 12.2, y: 7.7 } }],
      },
    });
    const valid = await request.post("/api/simulation", {
      data: {
        ...basePayload,
        tokenPlacements: [{ tokenId: "shaft_buffer", point: { x: 5.4, y: 3.95 } }],
      },
    });

    const [noneBody, invalidBody, validBody] = await Promise.all([
      none.json(),
      invalid.json(),
      valid.json(),
    ]);
    const shaftSpeed = (body: any) =>
      body.streamlines.find((line: any) => line.id === "pipeshaft-drift").speedMps;

    expect(shaftSpeed(invalidBody)).toBe(shaftSpeed(noneBody));
    expect(shaftSpeed(validBody)).toBeLessThan(shaftSpeed(noneBody));
  });

  test("returns actionable error for invalid template", async ({ request }) => {
    const response = await request.post("/api/simulation", {
      data: { templateId: "not-real", tokenPlacements: [] },
    });

    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "templateId must be one of: tampines-greenweave, tengah-5room, resale-exec-1990s.",
    });
  });
});
