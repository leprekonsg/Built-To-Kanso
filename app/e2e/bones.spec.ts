import { expect, test } from "@playwright/test";

test.describe("Reading the Bones", () => {
  test("asks for Threshold inputs when opened directly", async ({ page }) => {
    await page.goto("/bones");

    await expect(page.getByRole("heading", { name: "The house is listening." })).toBeVisible();
    await expect(page.getByText("Choose a template, set the door, floor, and scenario")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to Threshold" })).toHaveAttribute("href", "/threshold");
  });

  test("renders template geometry, Black state, Scout Pass, and paired Damp Risk", async ({ page }) => {
    await page.goto("/bones?template=resale-exec-1990s&compass=255&floor=11&scenario=just-moved-in");

    await expect(page.getByRole("heading", { name: "The house is listening." })).toBeVisible();
    await expect(page.getByLabel("Threshold inputs")).toContainText("255°");
    await expect(page.getByText("9% openings · marginal")).toBeVisible();
    await expect(page.getByLabel("resale-exec-1990s geometry plan")).toBeVisible();

    await expect(page.getByText("HDB / SCDF fixed")).toBeVisible();
    await expect(page.getByText(/Shaft Buffer can only attach within the 0\.6m pipeshaft clearance/)).toBeVisible();
    await expect(page.getByText("Scout Pass", { exact: true })).toBeVisible();
    await expect(page.getByText("Pillow-level humidity wants a buffer.")).toBeVisible();
    await expect(page.getByText(/78% RH at pillow · Place a Shaft Buffer/)).toBeVisible();
  });
});
