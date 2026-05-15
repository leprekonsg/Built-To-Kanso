import { expect, test } from "@playwright/test";

test.describe("Threshold onboarding", () => {
  test("shows Plan Upload as a Phase 2 stub and keeps templates as the Phase 1 path", async ({ page }) => {
    await page.goto("/threshold");

    await expect(page.getByRole("heading", { name: "Plan Upload" })).toBeVisible();
    await expect(page.getByText("Plan Upload is Phase 2.")).toBeVisible();
    await expect(page.getByText("For Phase 1, choose one HDB template below.")).toBeVisible();

    const uploadStub = page.getByRole("button", { name: /Upload plan \(Phase 2\)/ });
    await expect(uploadStub).toBeDisabled();
    await expect(uploadStub).toHaveAttribute("aria-disabled", "true");
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
  });

  test("keeps Continue inert until all four inputs are explicitly confirmed", async ({ page }) => {
    await page.goto("/threshold");

    await expect(page.getByRole("heading", { name: /STEP OVER THE threshold/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Choose the unit" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Turn the door" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Choose the floor" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Where are you in the home?" })).toBeVisible();

    const continueLink = page.getByRole("link", { name: /Continue/ });
    await expect(continueLink).toHaveAttribute("aria-disabled", "true");
    await expect(continueLink).toHaveAttribute("tabindex", "-1");

    await page.getByRole("button", { name: /Tampines GreenWeave/ }).click();
    await page.getByRole("radio", { name: /Just moved in/ }).click();
    await expect(continueLink).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText("Confirm the door and the floor before continuing.")).toBeVisible();

    await page.getByRole("slider", { name: "Door facing direction" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(continueLink).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText("Confirm the floor before continuing.")).toBeVisible();
  });

  test("selects inputs, updates summary, and routes to Studio", async ({ page }) => {
    await page.goto("/threshold");

    await page.getByRole("button", { name: /Tampines GreenWeave/ }).click();
    await expect(page.getByLabel("Threshold summary")).toContainText("Tampines GreenWeave");

    const compass = page.getByRole("slider", { name: "Door facing direction" });
    await compass.focus();
    await page.keyboard.press("ArrowRight");
    await expect(compass).toHaveAttribute("aria-valuenow", "15");
    await expect(page.getByLabel("Threshold summary")).toContainText("015°");

    await page.getByLabel("Floor level").fill("16");
    await expect(page.getByLabel("Threshold summary")).toContainText("Wind Turbulent");

    await page.getByRole("radio", { name: /Just moved in/ }).click();
    await expect(page.getByRole("radio", { name: /Just moved in/ })).toHaveAttribute("aria-checked", "true");

    const continueLink = page.getByRole("link", { name: /Continue/ });
    await expect(continueLink).toHaveAttribute("aria-disabled", "false");
    await continueLink.click();
    await expect(page).toHaveURL(/\/studio\?template=tampines-greenweave&compass=15&floor=16&scenario=just-moved-in$/);
    await expect(page.getByRole("heading", { name: "The house is listening." })).toBeVisible();
    await expect(page.getByLabel("Threshold inputs")).toContainText("015°");
  });

  test("does not overflow on mobile viewport", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile-only responsive smoke");

    await page.goto("/threshold");
    await expect(page.getByRole("heading", { name: /STEP OVER THE threshold/i })).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hasHorizontalOverflow).toBe(false);

    const compassBox = await page.getByRole("slider", { name: "Door facing direction" }).boundingBox();
    expect(compassBox?.width ?? 0).toBeLessThanOrEqual(390);
  });
});
