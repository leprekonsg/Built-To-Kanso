import { expect, test } from "@playwright/test";

const TEMPLATE = "resale-exec-1990s";

test.describe("Sketch release containment", () => {
  test("keeps the Plan SVG explicitly diagnostic", async ({ request }) => {
    const response = await request.post("/api/sketches/plan", {
      data: { templateId: TEMPLATE }, headers: { accept: "image/svg+xml" },
    });
    expect(response.status()).toBe(200);
    expect(response.headers()["x-geometry-use"]).toBe("diagnostic-only");
    expect(response.headers()["content-type"]).toContain("image/svg+xml");
    expect(await response.text()).toContain("Topology proof");
  });

  test("withholds Plan PNG and JSON presentation assets", async ({ request }) => {
    for (const accept of ["image/png", "application/json"]) {
      const response = await request.post("/api/sketches/plan", {
        data: { templateId: TEMPLATE }, headers: { accept },
      });
      expect(response.status()).toBe(422);
      await expect(response.json()).resolves.toMatchObject({ error: "geometry_not_ready", releaseGate: { eligible: false } });
    }
  });

  test("keeps only the explicit deterministic Life anchor diagnostic", async ({ request }) => {
    const diagnostic = await request.post("/api/sketches/life?anchor=1", {
      data: { templateId: TEMPLATE }, headers: { accept: "image/svg+xml" },
    });
    expect(diagnostic.status()).toBe(200);
    expect(diagnostic.headers()["x-life-anchor-source"]).toBe("deterministic-svg");
    expect(await diagnostic.text()).toContain("camera-view greybox anchor");

    const presentation = await request.post("/api/sketches/life", {
      data: { templateId: TEMPLATE }, headers: { accept: "image/png" },
    });
    expect(presentation.status()).toBe(422);
    await expect(presentation.json()).resolves.toMatchObject({ error: "geometry_not_ready" });
  });

  test("withholds wind compositions for unreviewed geometry", async ({ request }) => {
    for (const accept of ["image/svg+xml", "application/json"]) {
      const response = await request.post("/api/sketches/wind", {
        data: { templateId: TEMPLATE }, headers: { accept },
      });
      expect(response.status()).toBe(422);
      await expect(response.json()).resolves.toMatchObject({ error: "geometry_not_ready", releaseGate: { eligible: false } });
    }
  });
});
