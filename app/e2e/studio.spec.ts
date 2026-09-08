import { expect, test } from "@playwright/test";

test.describe("Studio geometry containment", () => {
  test("asks for Threshold inputs when opened directly", async ({ page }) => {
    await page.goto("/studio");
    await expect(page.getByRole("heading", { name: "The house has not yet heard you." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Step back to the threshold" })).toHaveAttribute("href", "/threshold");
  });

  test("surfaces malformed shared-link inputs before geometry review", async ({ page }) => {
    await page.goto("/studio?template=tampines-greenweave&compass=120&floor=11&scenario=mid_renovation");
    const issues = page.getByTestId("studio-param-issues");
    await expect(issues).toContainText("mid_renovation");
    await expect(issues).toContainText("mid-renovation");
  });

  test("flags an out-of-range floor as recoverable", async ({ page }) => {
    await page.goto("/studio?template=tampines-greenweave&compass=120&floor=99&scenario=mid-renovation");
    await expect(page.getByTestId("studio-param-issues")).toContainText(/floor.*99.*1-50/s);
  });

  test("shows diagnostic geometry while all templates await source review", async ({ page }) => {
    const simulationRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/simulation")) simulationRequests.push(request.url());
    });
    await page.goto("/studio?template=resale-exec-1990s&compass=255&floor=11&scenario=just-moved-in");

    const notice = page.getByTestId("geometry-review-required");
    await expect(notice).toContainText("This layout needs a source review.");
    await expect(notice).toContainText("Recommendations, simulation and shareable presentation images are paused.");
    await expect(page.getByRole("region", { name: "Diagnostic geometry, not a verified home layout" })).toContainText("Diagnostic template");
    await expect(page.getByLabel("resale-exec-1990s geometry plan")).toBeVisible();
    await expect(page.getByTestId("live-studio")).toHaveCount(0);
    await expect(page.getByTestId("weather-trial-west_sun_1720")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Shaft Buffer/ })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Designer" })).toHaveCount(0);
    expect(simulationRequests).toEqual([]);
  });
});
