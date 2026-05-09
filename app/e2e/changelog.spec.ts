import { expect, test } from "@playwright/test";

test.describe("House Changelog", () => {
  test("returns a short human receipt for valid placements", async ({ request }) => {
    const response = await request.post("/api/changelog", {
      data: {
        templateId: "resale-exec-1990s",
        placements: [
          { tokenId: "wind_gate", point: { x: 12.2, y: 7.7 } },
          { tokenId: "shaft_buffer", point: { x: 5.4, y: 3.95 } },
        ],
      },
    });

    expect(response.ok()).toBe(true);
    const body = await response.json();

    expect(body.allowed).toBe(true);
    expect(body.lines).toHaveLength(4);
    expect(body.lines.length).toBeLessThanOrEqual(5);
    expect(body.lines).toEqual([
      "entry rush softened",
      "pipeshaft jet deflected",
      "one corner left empty",
      "no fixed HDB elements touched",
    ]);
    expect(body.lines.join(" ")).not.toMatch(/token|valid|code|patch/i);
  });

  test("returns Golden Failure copy and alternatives for blocked placements", async ({ request }) => {
    const response = await request.post("/api/changelog", {
      data: {
        templateId: "resale-exec-1990s",
        placements: [{ tokenId: "wood_anchor", point: { x: 13.3, y: 7.4 } }],
      },
    });

    expect(response.ok()).toBe(true);
    const body = await response.json();

    expect(body.allowed).toBe(false);
    expect(body.lines.length).toBeLessThanOrEqual(5);
    expect(body.lines).toEqual([
      "This wall is not asking to be changed. HDB fixed elements stay untouched.",
      "Place a Soft Screen nearby.",
      "Use a behavior token instead.",
      "Leave this corner unbuilt for 90 days.",
    ]);
    expect(body.alternatives).toEqual([
      "Place a Soft Screen nearby.",
      "Use a behavior token instead.",
      "Leave this corner unbuilt for 90 days.",
    ]);
  });

  test("returns actionable errors for malformed requests", async ({ request }) => {
    const response = await request.post("/api/changelog", {
      data: {
        templateId: "resale-exec-1990s",
        placements: [{ tokenId: "wind_gate", point: { x: 12.2 } }],
      },
    });

    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "each placement must include tokenId and point { x, y } in plan meters.",
    });
  });
});
