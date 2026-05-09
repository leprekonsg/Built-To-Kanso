import { expect, test } from "@playwright/test";

test.describe("Methodology page", () => {
  test("discloses evidence tiers, cultural framing, audit gap, and hard rules", async ({ page }) => {
    await page.goto("/methodology");

    await expect(page.getByRole("heading", { name: "How the house is read." })).toBeVisible();
    await expect(page.getByText(/heuristic briefing system/i)).toBeVisible();
    await expect(page.getByText(/hidden Scout and Shikaku diagnostic spine/i)).toBeVisible();
    await expect(page.getByText(/Nanyang feng shui/i)).toBeVisible();
    await expect(page.getByText(/kansō \(簡素\)/i)).toBeVisible();
    await expect(page.getByText(/not Japanese kasō \(家相\)/i)).toBeVisible();

    const evidence = page.getByRole("region", { name: "Evidence ladder" });
    await expect(evidence.getByRole("heading", { name: "Official constraint" })).toBeVisible();
    await expect(evidence.getByRole("heading", { name: "Template fact" })).toBeVisible();
    await expect(evidence.getByRole("heading", { name: "Heuristic estimate" })).toBeVisible();
    await expect(evidence.getByRole("heading", { name: "Weather context" })).toBeVisible();
    await expect(evidence.getByRole("heading", { name: "Prototype visualisation" })).toBeVisible();
    await expect(evidence).toContainText("Cultural framing is separate");

    await expect(page.getByRole("heading", { name: "What we measure" })).toBeVisible();
    await expect(page.getByText(/does not claim lab measurement/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Audit gap" })).toBeVisible();
    await expect(page.getByText(/Not engineering certification/i)).toBeVisible();

    const rules = page.getByRole("region", { name: "Hard rules" });
    await expect(rules).toContainText("AI never edits compliance geometry");
    await expect(rules).toContainText("Cosmological vocabulary is Cultural framing only");
  });

  test("does not overflow on mobile viewport", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile-only responsive smoke");

    await page.goto("/methodology");
    await expect(page.getByRole("heading", { name: "How the house is read." })).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
