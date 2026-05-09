import { expect, test } from "@playwright/test";

test.describe("Reading the Bones", () => {
  test("asks for Threshold inputs when opened directly", async ({ page }) => {
    await page.goto("/bones");

    await expect(page.getByRole("heading", { name: "The house has not yet heard you." })).toBeVisible();
    await expect(page.getByText(/Bones reads a unit/)).toBeVisible();
    await expect(page.getByText(/Form-School feng shui/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Step back to the threshold" })).toHaveAttribute("href", "/threshold");
  });

  test("renders template geometry, fixed elements, asking points, and paired Damp Risk", async ({ page }) => {
    await page.goto("/bones?template=resale-exec-1990s&compass=255&floor=11&scenario=just-moved-in");

    await expect(page.getByRole("heading", { name: "The house is listening." })).toBeVisible();
    await expect(page.getByLabel("Threshold inputs")).toContainText("255°");
    await expect(page.getByText("9% openings. Fan Anchor likely.")).toBeVisible();
    await expect(page.getByLabel("resale-exec-1990s geometry plan")).toBeVisible();

    await expect(page.getByText("HDB / SCDF fixed")).toBeVisible();
    await expect(page.getByText(/Shaft Buffer is the only exception/)).toBeVisible();
    await expect(page.getByText("What the home is asking", { exact: true })).toBeVisible();
    await expect(page.getByText("Damp Risk wants a buffer.")).toBeVisible();
    await expect(page.getByText(/High Damp Risk\. Place a Shaft Buffer/)).toBeVisible();
    await expect(page.getByText("4 bedrooms share this damp recommendation.")).toBeVisible();
    await expect(page.getByText(/RH at pillow/)).not.toBeVisible();
  });

  test("Designer voice changes visible reading copy", async ({ page }) => {
    await page.goto("/bones?template=resale-exec-1990s&compass=255&floor=11&scenario=just-moved-in");

    await expect(page.getByText("Damp Risk wants a buffer.")).toBeVisible();
    await page.getByRole("tab", { name: "Designer" }).click();

    await expect(page.getByText(/Damp Risk is High for this bedroom/)).toBeVisible();
    await expect(page.getByText("Damp Risk wants a buffer.")).not.toBeVisible();
  });

  test("integrates LiveStudio, Weather Trial, and Designer material details calmly", async ({ page }) => {
    await page.goto("/bones?template=resale-exec-1990s&compass=255&floor=11&scenario=just-moved-in");

    await expect(page.getByRole("region", { name: "LiveStudio" })).toContainText("LiveStudio");
    await expect(page.getByText("Environmental material system")).toBeVisible();
    await expect(page.getByRole("region", { name: "Weather Trial" })).toContainText("NE monsoon");
    await expect(page.getByRole("region", { name: "Weather Trial" })).toContainText("SW monsoon");
    await expect(page.getByRole("region", { name: "Weather Trial" })).toContainText("West-sun still air");

    await expect(page.getByRole("region", { name: "Glow, Quiet, and Damp checks" })).toContainText("Glow");
    await expect(page.getByRole("region", { name: "Glow, Quiet, and Damp checks" })).toContainText("Quiet");
    await expect(page.getByRole("region", { name: "Glow, Quiet, and Damp checks" })).toContainText("Damp");
    await expect(page.getByText(/severity|scanner|defect backlog/i)).not.toBeVisible();

    await page.getByRole("tab", { name: "Designer" }).click();

    await expect(page.getByText("Material preset")).toBeVisible();
    await expect(page.getByText("Audit overlay")).toBeVisible();
    await expect(page.getByText("Quantity readout")).toBeVisible();
    await expect(page.getByText(/ACH estimate/i)).toBeVisible();
    await expect(page.getByText(/SHGC/i)).toBeVisible();
  });

  test("committed tokens update Damp Risk, Kanso Reserve, and House Changelog", async ({ page }) => {
    await page.goto("/bones?template=resale-exec-1990s&compass=255&floor=11&scenario=just-moved-in");

    const reserveCard = page.locator("section").filter({ hasText: "Reserve" }).first();
    const reserveValue = reserveCard.getByText(/^\d+% empty$/);
    const beforeReserve = await reserveValue.textContent();
    await page.getByRole("button", { name: /Shaft Buffer/ }).click();
    const point = await planPointToViewport(page, { x: 5.4, y: 3.95 });
    await page.mouse.click(point.x, point.y);

    await expect(page.getByText(/Watch Damp Risk/)).toBeVisible();
    await expect(page.getByText("1 bedroom shares this damp recommendation.")).toBeVisible();
    await expect(page.getByText("pipeshaft jet deflected.")).toBeVisible();
    await expect(page.getByText(/Damp Risk is a layout-based comfort estimate/)).toHaveCount(2);

    const afterReserve = await reserveValue.textContent();
    expect(afterReserve).not.toBe(beforeReserve);
  });
});

async function planPointToViewport(page: import("@playwright/test").Page, point: { x: number; y: number }) {
  const canvas = page.locator('svg[role="application"]');
  await canvas.scrollIntoViewIfNeeded();
  return canvas.evaluate((svg, target) => {
    const planSvg = svg as SVGSVGElement;
    const svgPoint = planSvg.createSVGPoint();
    svgPoint.x = target.x;
    svgPoint.y = target.y;
    const matrix = planSvg.getScreenCTM();
    if (!matrix) throw new Error("plan canvas is not mounted");
    const viewportPoint = svgPoint.matrixTransform(matrix);
    return { x: viewportPoint.x, y: viewportPoint.y };
  }, point);
}
