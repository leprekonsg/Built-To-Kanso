import { expect, test } from "@playwright/test";

test.describe("Sketch route fallbacks", () => {
  test("serves deterministic SVG fallback for Plan Sketch when PNG/OpenAI are unavailable", async ({ request }) => {
    const response = await request.post("/api/sketches/plan", {
      data: { templateId: "resale-exec-1990s" },
      headers: { accept: "image/svg+xml" },
    });

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/svg+xml");
    expect(response.headers()["x-sketch-fallback"]).toBe("deterministic-svg");

    const svg = await response.text();
    expect(svg).toContain("<svg");
    expect(svg).toContain("Plan Sketch fallback");
    expect(svg).toContain('data-render-watermark="draft"');
    expect(svg).toContain("DRAFT · PROTOTYPE VISUALISATION");
    expect(svg).toContain("Master Bedroom");
    expect(svg).not.toContain("streamline");
  });

  test("uses local prebaked Plan Sketch asset when JSON is requested", async ({ request }) => {
    const response = await request.post("/api/sketches/plan", {
      data: { templateId: "resale-exec-1990s" },
      headers: { accept: "application/json" },
    });

    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      fallback: false,
      contentType: "image/png",
      source: "local-prebaked",
      cachePath: "plan-sketches/resale-exec-1990s/plan.png",
      tier: "prototype_visualisation",
    });
  });

  test("serves local prebaked Plan Sketch PNG for every Phase 1 template", async ({ request }) => {
    for (const templateId of ["tampines-greenweave", "tengah-5room", "resale-exec-1990s"]) {
      const response = await request.post("/api/sketches/plan", {
        data: { templateId },
      });

      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toContain("image/png");
      expect(response.headers()["x-sketch-source"]).toBe("local-prebaked");
      expect(response.headers()["x-plan-sketch-cache-path"]).toBe(`plan-sketches/${templateId}/plan.png`);
      const bytes = Buffer.from(await response.body());
      expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    }
  });

  test("serves deterministic Life Sketch anchor SVG when explicitly requested", async ({ request }) => {
    const response = await request.post("/api/sketches/life", {
      data: { templateId: "resale-exec-1990s" },
      headers: { accept: "image/svg+xml" },
    });

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/svg+xml");
    expect(response.headers()["x-sketch-fallback"]).toBe("deterministic-anchor-svg");
    expect(response.headers()["x-life-anchor-source"]).toBe("deterministic-svg");
    expect(response.headers()["x-life-anchor-cache-path"]).toBe("life-anchors/resale-exec-1990s/anchor.png");

    const svg = await response.text();
    expect(svg).toContain("<svg");
    expect(svg).toContain("Life Sketch anchor fallback");
    expect(svg).toContain('data-render-watermark="draft"');
    expect(svg).toContain("DRAFT · PROTOTYPE VISUALISATION");
    expect(svg).toContain("Household Shelter");
  });

  test("uses local prebaked Life Sketch anchor when OpenAI is unavailable", async ({ request }) => {
    const response = await request.post("/api/sketches/life", {
      data: { templateId: "resale-exec-1990s" },
      headers: { accept: "application/json" },
    });

    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      fallback: true,
      contentType: "image/png",
      reason: "local_prebaked_anchor",
      nextAction: expect.any(String),
      tier: "prototype_visualisation",
      source: "local-prebaked-anchor",
      anchor: {
        source: "cache-png",
        cachePath: "life-anchors/resale-exec-1990s/anchor.png",
      },
    });
  });

  test("serves local prebaked Life anchor PNG for every Phase 1 template when materialization is unavailable", async ({ request }) => {
    for (const templateId of ["tampines-greenweave", "tengah-5room", "resale-exec-1990s"]) {
      const response = await request.post("/api/sketches/life", {
        data: { templateId },
      });

      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toContain("image/png");
      expect(response.headers()["x-sketch-source"]).toBe("local-prebaked-anchor");
      expect(response.headers()["x-life-anchor-cache-path"]).toBe(`life-anchors/${templateId}/anchor.png`);
      const bytes = Buffer.from(await response.body());
      expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    }
  });

  test("serves final deterministic Wind Sketch composition with streamlines kept in SVG", async ({ request }) => {
    const first = await request.post("/api/sketches/wind", {
      data: { templateId: "resale-exec-1990s" },
      headers: { accept: "image/svg+xml" },
    });
    const second = await request.post("/api/sketches/wind", {
      data: { templateId: "resale-exec-1990s" },
      headers: { accept: "image/svg+xml" },
    });

    expect(first.status()).toBe(200);
    expect(first.headers()["content-type"]).toContain("image/svg+xml");
    expect(first.headers()["x-sketch-source"]).toBe("deterministic-svg-composite");
    expect(first.headers()["x-prompt-id"]).toBeUndefined();

    const firstSvg = await first.text();
    const secondSvg = await second.text();

    expect(firstSvg).toBe(secondSvg);
    expect(firstSvg).toContain("Wind Sketch");
    expect(firstSvg).toContain('data-layer="deterministic-streamlines"');
    expect(firstSvg).toContain('data-render-watermark="draft"');
    expect(firstSvg).toContain("DRAFT · PROTOTYPE VISUALISATION");
    expect(firstSvg).toContain("data-streamline-id=");
    expect(firstSvg).not.toContain("GPT");
  });

  test("returns actionable JSON for Wind Sketch deterministic composition", async ({ request }) => {
    const response = await request.post("/api/sketches/wind", {
      data: { templateId: "resale-exec-1990s" },
      headers: { accept: "application/json" },
    });

    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      fallback: false,
      contentType: "image/svg+xml",
      source: "deterministic-svg-composite",
      tier: "prototype_visualisation",
      nextAction: expect.stringContaining("Request image/svg+xml"),
    });
  });
});
