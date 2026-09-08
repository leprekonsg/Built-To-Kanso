import { expect, test } from "@playwright/test";

test.describe("Recommendation Proof containment", () => {
  test("withholds proof and materialisation until source review", async ({ page }) => {
    const downstream: string[] = [];
    page.on("request", (request) => {
      if (/\/api\/(sketches\/life|simulation)/.test(request.url())) downstream.push(request.url());
    });
    await page.goto("/recommendation-proof?template=resale-exec-1990s&compass=255&floor=11&scenario=just-moved-in");
    await expect(page.getByTestId("geometry-review-required")).toContainText("This layout needs a source review.");
    await expect(page.getByTestId("recommendation-proof-flow")).toHaveCount(0);
    await expect(page.getByTestId("recommendation-proof-actions")).toHaveCount(0);
    await expect(page.getByTestId("life-sketch-materialization")).toHaveCount(0);
    expect(downstream).toEqual([]);
  });

  test("keeps invalid URL diagnostics ahead of review containment", async ({ page }) => {
    await page.goto("/recommendation-proof?template=not-real&compass=255&floor=11&scenario=just-moved-in");
    await expect(page.getByText(/template.*not-real/i)).toBeVisible();
    await expect(page.getByTestId("geometry-review-required")).toHaveCount(0);
  });
});
