import { expect, test } from "@playwright/test";

test.describe("Ghost Futures", () => {
  test("returns rule-engine A/B/C futures when no hover candidate is supplied", async ({ request }) => {
    const response = await request.post("/api/ghost-futures", {
      data: {
        templateId: "resale-exec-1990s",
        compassDeg: 260,
        floor: 11,
        placements: [],
      },
    });

    expect(response.ok()).toBe(true);
    const body = await response.json();

    expect(body.futures).toHaveLength(3);
    expect(body.futures.map((future: { slot: string }) => future.slot)).toEqual(["A", "B", "C"]);
    expect(body.futures[0]).toMatchObject({
      slot: "A",
      role: "recommended",
      tokenId: "shaft_buffer",
      allowed: true,
      code: "ok",
      dampBandCopy: "Main Bedroom Damp Risk moves High to Watch.",
    });
    expect(body.futures[1]).toMatchObject({
      slot: "B",
      role: "current",
      tokenId: null,
      allowed: true,
      code: "ok",
      breathDelta: {
        estimatedChangePct: 0,
        tier: "heuristic_estimate",
      },
      dampBandCopy: "Main Bedroom Damp Risk holds at High.",
    });
    expect(body.futures[2]).toMatchObject({
      slot: "C",
      role: "alternate",
      allowed: true,
      code: "ok",
    });
    for (const future of body.futures) {
      expect(future.breathCopy).toEqual(expect.any(String));
      expect(future.breathCopy.length).toBeGreaterThan(0);
      expect(future.dampBandCopy).toEqual(expect.any(String));
      expect(future.dampBandCopy.length).toBeGreaterThan(0);
    }
    expect(JSON.stringify(body)).not.toMatch(/predictedRhPct|thresholdPct|RH at pillow/i);
  });

  test("does not recommend an already placed token as the A future", async ({ request }) => {
    const response = await request.post("/api/ghost-futures", {
      data: {
        templateId: "resale-exec-1990s",
        compassDeg: 260,
        floor: 11,
        placements: [{ tokenId: "shaft_buffer", point: { x: 5.4, y: 3.95 } }],
      },
    });

    expect(response.ok()).toBe(true);
    const body = await response.json();

    expect(body.futures).toHaveLength(3);
    expect(body.futures[0]).toMatchObject({
      slot: "A",
      role: "recommended",
      allowed: true,
    });
    expect(body.futures[0].tokenId).not.toBe("shaft_buffer");
    expect(body.futures[1]).toMatchObject({
      slot: "B",
      role: "current",
      tokenId: null,
      dampBandCopy: "Main Bedroom Damp Risk holds at Watch.",
    });
  });

  test("previews Shaft Buffer breath and Damp Risk deltas before placement", async ({ request }) => {
    const response = await request.post("/api/ghost-futures", {
      data: {
        templateId: "resale-exec-1990s",
        compassDeg: 260,
        floor: 11,
        candidates: [{ tokenId: "shaft_buffer", point: { x: 5.4, y: 3.95 } }],
      },
    });

    expect(response.ok()).toBe(true);
    const body = await response.json();

    expect(body.futures).toHaveLength(1);
    expect(body.futures[0]).toMatchObject({
      tokenId: "shaft_buffer",
      allowed: true,
      code: "ok",
      breathDelta: {
        label: "Pipeshaft jet deflects",
        tier: "prototype_visualisation",
      },
      dampDelta: {
        roomId: "main_bedroom",
        beforeBand: "high",
        afterBand: "watch",
        tier: "heuristic_estimate",
      },
    });
    expect(body.futures[0].preview).toContain("Damp Risk moves High to Watch");
    expect(JSON.stringify(body)).not.toMatch(/predictedRhPct|thresholdPct|RH at pillow/i);
  });

  test("returns Golden Failure alternatives for blocked future placements", async ({ request }) => {
    const response = await request.post("/api/ghost-futures", {
      data: {
        templateId: "resale-exec-1990s",
        compassDeg: 260,
        floor: 11,
        candidates: [{ tokenId: "wood_anchor", point: { x: 13.3, y: 7.4 } }],
      },
    });

    expect(response.ok()).toBe(true);
    const body = await response.json();

    expect(body.futures[0]).toMatchObject({
      tokenId: "wood_anchor",
      allowed: false,
      code: "black_state_blocked",
      preview: "This wall is not asking to be changed. HDB fixed elements stay untouched.",
      alternatives: [
        "Place a Soft Screen nearby.",
        "Use a behavior token instead.",
        "Leave this corner unbuilt for 90 days.",
      ],
    });
  });

  test("previews against already committed placements", async ({ request }) => {
    const response = await request.post("/api/ghost-futures", {
      data: {
        templateId: "resale-exec-1990s",
        compassDeg: 260,
        floor: 11,
        placements: [{ tokenId: "shaft_buffer", point: { x: 5.4, y: 3.95 } }],
        candidates: [{ tokenId: "wind_gate", point: { x: 12.2, y: 7.7 } }],
      },
    });

    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.futures[0].dampDelta).toBeUndefined();
    expect(body.futures[0].preview).toContain("Damp Risk band stays unchanged");
  });

  test("returns actionable errors for malformed existing placements", async ({ request }) => {
    const response = await request.post("/api/ghost-futures", {
      data: {
        templateId: "resale-exec-1990s",
        compassDeg: 260,
        floor: 11,
        placements: [{ tokenId: "wind_gate", point: { x: 12.2 } }],
        candidates: [{ tokenId: "shaft_buffer", point: { x: 5.4, y: 3.95 } }],
      },
    });

    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "each placement must include tokenId and point { x, y } in plan meters.",
    });
  });

  test("returns actionable errors for malformed candidates", async ({ request }) => {
    const response = await request.post("/api/ghost-futures", {
      data: {
        templateId: "resale-exec-1990s",
        compassDeg: 260,
        floor: 11,
        candidates: [{ tokenId: "shaft_buffer", point: { x: 5.4 } }],
      },
    });

    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "each candidate must include tokenId and point { x, y } in plan meters.",
    });
  });

  test("renders the A/B/C comparison lanes in the Studio", async ({ page }) => {
    await page.goto("/studio?template=resale-exec-1990s&compass=260&floor=11&scenario=just-moved-in");

    await expect(page.getByText("Ghost Futures", { exact: true })).toBeVisible();
    await expect(page.getByText("A · Recommended")).toBeVisible();
    await expect(page.getByText("B · Current")).toBeVisible();
    await expect(page.getByText("C · Alternate")).toBeVisible();
    await expect(page.locator("dd").getByText("Main Bedroom Damp Risk moves High to Watch.", { exact: true })).toBeVisible();
    await expect(page.locator("dd").getByText("Main Bedroom Damp Risk holds at High.", { exact: true }).first()).toBeVisible();
  });
});
