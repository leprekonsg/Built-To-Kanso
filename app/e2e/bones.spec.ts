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
    await expect(page.getByText("Pillow-level humidity wants a buffer.")).toBeVisible();
    await expect(page.getByText(/78% RH at pillow\. Place a Shaft Buffer/)).toBeVisible();
    await expect(page.getByText("4 bedrooms share this damp recommendation.")).toBeVisible();
  });
});
