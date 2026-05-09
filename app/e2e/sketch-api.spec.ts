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
    });
  });
});
