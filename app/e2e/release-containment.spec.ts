import { test, expect } from "@playwright/test";
import path from "node:path";

test("unreviewed templates expose diagnostics without running resident analysis", async ({ page }) => {
  const analysisCalls: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/api\/(simulation|scout|ghost-futures|sketches|resonance)/.test(request.url())) analysisCalls.push(request.url());
  });
  for (const template of ["tampines-greenweave", "tengah-5room", "resale-exec-1990s"]) {
    await page.goto(`/studio?template=${template}&compass=255&floor=11&scenario=just-moved-in`);
    await expect(page.getByRole("heading", { name: "This layout needs a source review." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Diagnostic template" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Diagnostic geometry, not a verified home layout" }).locator("svg")).toBeVisible();
    await expect(page.getByRole("region", { name: "LiveStudio", exact: true })).toHaveCount(0);
    await expect(page.getByTestId("recommendation-proof-actions")).toHaveCount(0);
  }
  expect(analysisCalls).toEqual([]);
  await page.screenshot({ path: path.join(process.env.TEMP ?? test.info().outputDir, `kanso-source-review-${test.info().project.name}.png`), fullPage: true });
});
