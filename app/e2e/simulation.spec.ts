import { expect, test } from "@playwright/test";

interface SimulationStreamlineJson {
  id: string;
  material: string;
  speedMps: number;
}

interface SimulationParticleJson {
  kind: string;
  material: string;
  delayMs: number;
}

interface SimulationResponseJson {
  streamlines: SimulationStreamlineJson[];
  particles: SimulationParticleJson[];
}

test.describe("Tier 4 simulation API", () => {
  test("returns deterministic field output with explicit simulation source", async ({ request }) => {
    const payload = {
      templateId: "resale-exec-1990s",
      condition: "ne_monsoon",
      tokenPlacements: [{ tokenId: "shaft_buffer", point: { x: 5.4, y: 3.95 } }],
    };

    const first = await request.post("/api/simulation", { data: payload });
    const second = await request.post("/api/simulation", { data: payload });

    expect(first.ok()).toBe(true);
    expect(second.ok()).toBe(true);

    const firstBody = (await first.json()) as SimulationResponseJson;
    const secondBody = (await second.json()) as SimulationResponseJson;

    expect(firstBody).toEqual(secondBody);
    expect(firstBody).toMatchObject({
      templateId: "resale-exec-1990s",
      condition: { id: "ne_monsoon", label: "NE monsoon" },
      source: { kind: "cpu_reference" },
      simulationSource: { kind: "cpu_reference" },
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
    expect(firstBody.streamlines.length).toBeGreaterThanOrEqual(3);
    // 3 clean-air particles + 3-particle pipeshaft jet (Hard Rule #16): the
    // gray-vs-amber render path needs the directional drift to read as a jet.
    expect(firstBody.particles).toHaveLength(6);
    expect(firstBody.velocitySamples.length).toBeGreaterThanOrEqual(4);
    expect(firstBody.streamlines.map((line) => line.material)).toContain("sumi_ink");
    expect(firstBody.streamlines.map((line) => line.material)).toContain("silk_ribbon");

    const cleanAir = firstBody.particles.filter((particle) => particle.kind === "clean_air");
    const pipeshaft = firstBody.particles.filter((particle) => particle.kind === "pipeshaft_drift");
    expect(cleanAir).toHaveLength(3);
    expect(pipeshaft).toHaveLength(3);
    expect(cleanAir.every((particle) => particle.material === "sunlit_dust")).toBe(true);
    expect(pipeshaft.every((particle) => particle.material === "hdb_concrete_dust")).toBe(true);
    // Jet cascade: each subsequent pipeshaft particle has a later delay so the
    // gray drift reads as a directional wave, not a static cluster.
    for (let i = 1; i < pipeshaft.length; i++) {
      expect(pipeshaft[i].delayMs).toBeGreaterThan(pipeshaft[i - 1].delayMs);
    }
  });

  test("only valid Shaft Buffer placements deflect the pipeshaft field", async ({ request }) => {
    const basePayload = { templateId: "resale-exec-1990s", condition: "ne_monsoon" };
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
    const shaftSpeed = (body: SimulationResponseJson) =>
      body.streamlines.find((line) => line.id === "pipeshaft-drift")?.speedMps;

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

  test("returns distinct fields for each Weather Trial condition", async ({ request }) => {
    const basePayload = { templateId: "tampines-greenweave", tokenPlacements: [] };
    const [westSun, highwayNight, neWind] = await Promise.all([
      request.post("/api/simulation", { data: { ...basePayload, condition: "west_sun_1720" } }),
      request.post("/api/simulation", { data: { ...basePayload, condition: "highway_night" } }),
      request.post("/api/simulation", { data: { ...basePayload, condition: "ne_monsoon_wind" } }),
    ]);

    const [westSunBody, highwayNightBody, neWindBody] = await Promise.all([
      westSun.json(),
      highwayNight.json(),
      neWind.json(),
    ]);

    expect(westSun.ok()).toBe(true);
    expect(highwayNight.ok()).toBe(true);
    expect(neWind.ok()).toBe(true);
    expect(westSunBody.condition).toMatchObject({ id: "west_sun_1720", label: "West Sun 17:20" });
    expect(highwayNightBody.condition).toMatchObject({ id: "highway_night", label: "Highway Night" });
    expect(neWindBody.condition).toMatchObject({ id: "ne_monsoon_wind", label: "NE Monsoon Wind" });
    expect([
      westSunBody.simulationSource.kind,
      highwayNightBody.simulationSource.kind,
      neWindBody.simulationSource.kind,
    ]).toEqual([
      "cpu_reference",
      "cpu_reference",
      "cpu_reference",
    ]);
    expect(westSunBody.velocitySamples).not.toEqual(highwayNightBody.velocitySamples);
    expect(westSunBody.velocitySamples).not.toEqual(neWindBody.velocitySamples);
    expect(westSunBody.streamlines).not.toEqual(highwayNightBody.streamlines);
  });
});
