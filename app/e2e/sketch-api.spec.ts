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
    expect(svg).toContain("Master Bedroom");
    expect(svg).not.toContain("streamline");
  });

  test("returns actionable JSON for Plan Sketch fallback when JSON is requested", async ({ request }) => {
    const response = await request.post("/api/sketches/plan", {
      data: { templateId: "resale-exec-1990s" },
      headers: { accept: "application/json" },
    });

    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      fallback: true,
      contentType: "image/svg+xml",
      reason: "png_or_openai_unavailable",
      nextAction: expect.stringContaining("Request image/svg+xml"),
      tier: "prototype_visualisation",
    });
  });

  test("serves deterministic Life Sketch anchor fallback when anchor PNG is missing", async ({ request }) => {
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
    expect(svg).toContain("Household Shelter");
  });

  test("returns actionable JSON for Life Sketch fallback when anchor PNG is missing", async ({ request }) => {
    const response = await request.post("/api/sketches/life", {
      data: { templateId: "resale-exec-1990s" },
      headers: { accept: "application/json" },
    });

    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      fallback: true,
      contentType: "image/svg+xml",
      reason: "anchor_png_missing",
      nextAction: expect.stringContaining("anchorPng"),
      tier: "prototype_visualisation",
      anchor: {
        source: "deterministic-svg",
        cachePath: "life-anchors/resale-exec-1990s/anchor.png",
      },
    });
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
