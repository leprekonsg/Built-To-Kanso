import { expect, test } from "@playwright/test";
import { hashBytes } from "../src/lib/imageHash";
import { LIFE_SKETCH_QA_GATE_VERSION } from "../src/server/openai/lifeSketchReview";

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
    expect(svg).toContain("Topology proof");
    expect(svg).toContain('data-render-watermark="draft"');
    expect(svg).toContain("DRAFT · PROTOTYPE VISUALISATION");
    expect(svg).toContain('data-room-id="main_bedroom"');
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
    const response = await request.post("/api/sketches/life?anchor=1", {
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
    expect(svg).toContain("camera-view greybox anchor");
    expect(svg).toContain('data-render-watermark="draft"');
    expect(svg).toContain("three-orthographic-greybox-scene-manifest");
    expect(svg).toContain("fixed:household_shelter_black");
    expect(svg).not.toContain("DRAFT · PROTOTYPE VISUALISATION");
  });

  test("reports accepted Life Sketch provenance or an explicit deterministic fallback", async ({ request }) => {
    const response = await request.post("/api/sketches/life", {
      data: { templateId: "resale-exec-1990s" },
      headers: { accept: "application/json" },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.tier).toBe("prototype_visualisation");
    expect(body.anchor.complianceTruth).toBe(false);
    expect(body.anchor.topologyProof).toBe("plan-sketches/resale-exec-1990s/plan.png");
    expect(body.anchor.scene).toBe("three-orthographic-greybox-scene-manifest");
    if (body.source === "accepted-gpt-image-2-prebake") {
      expect(body).toMatchObject({
        fallback: false,
        contentType: "image/png",
        reason: "accepted_gpt_image_2_prebake",
        cachePath: "life-sketches/resale-exec-1990s/accepted.png",
        metadataPath: "life-sketches/resale-exec-1990s/accepted.json",
      });
      const metadata = await (await request.get(`/${body.metadataPath}`)).json();
      expect(metadata.qaGateVersion).toBe(LIFE_SKETCH_QA_GATE_VERSION);
      expect(body.acceptedCandidateIndex).toBeGreaterThanOrEqual(0);
      expect(body.acceptedCandidateIndex).toBeLessThan(body.candidateCount);
    } else {
      expect(body).toMatchObject({
        fallback: true,
        contentType: "image/svg+xml",
        reason: "missing_accepted_gpt_prebake",
        source: "deterministic-sumi-e-life-sketch",
      });
      expect(body.nextAction).toMatch(/prebake/i);
      expect(body.acceptedCandidateIndex).toBeUndefined();
      expect(response.headers()["x-sketch-fallback"]).toBe("missing-accepted-gpt-prebake");
    }
  });

  test("serves a verified PNG or deterministic SVG for every Phase 1 template", async ({ request }) => {
    for (const templateId of ["tampines-greenweave", "tengah-5room", "resale-exec-1990s"]) {
      const response = await request.post("/api/sketches/life", {
        data: { templateId },
        headers: { accept: "image/png" },
      });

      expect(response.status()).toBe(200);
      expect(response.headers()["x-evidence-tier"]).toBe("prototype_visualisation");
      if (response.headers()["x-sketch-source"] === "accepted-gpt-image-2-prebake") {
        expect(response.headers()["content-type"]).toContain("image/png");
        expect(response.headers()["x-life-sketch-mode"]).toBe("accepted-gpt-image-2-prebake");
        expect(response.headers()["x-life-sketch-cache-path"]).toBe(`life-sketches/${templateId}/accepted.png`);
        expect(response.headers()["x-life-sketch-metadata-path"]).toBe(`life-sketches/${templateId}/accepted.json`);
        expect(response.headers()["x-life-sketch-qa"]).toBe("accepted_from_prebake");
        expect(response.headers()["x-life-sketch-candidates"]).toMatch(/^[23]$/);
        expect(response.headers()["x-life-sketch-accepted-candidate"]).toMatch(/^[0-2]$/);
        const bytes = Buffer.from(await response.body());
        expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
        const metadata = await (await request.get(`/life-sketches/${templateId}/accepted.json`)).json();
        expect(metadata.qaGateVersion).toBe(LIFE_SKETCH_QA_GATE_VERSION);
        expect(metadata.pngHash).toBe(hashBytes(bytes));
        expect(metadata.acceptedCandidateIndex).toBeLessThan(metadata.candidateCount);
      } else {
        expect(response.headers()["content-type"]).toContain("image/svg+xml");
        expect(response.headers()["x-sketch-source"]).toBe("deterministic-sumi-e-life-sketch");
        expect(response.headers()["x-life-sketch-mode"]).toBe("deterministic-sumi-e");
        expect(response.headers()["x-sketch-fallback"]).toBe(templateId === "tampines-greenweave" ? "geometry_source_conflict" : "missing-accepted-gpt-prebake");
        expect(response.headers()["x-life-sketch-qa"]).toBeUndefined();
        expect(response.headers()["x-life-sketch-accepted-candidate"]).toBeUndefined();
        const svg = await response.text();
        expect(svg).toContain('data-layer="locked-anchor-materialized-surfaces"');
        expect(svg).toContain("No generated geometry is compliance truth.");
        expect(svg).not.toContain("NaN");
      }
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
