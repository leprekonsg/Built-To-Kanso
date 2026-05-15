import { expect, test } from "@playwright/test";

test.describe("Recommendation Proof", () => {
  test("connects Life Sketch, deterministic airflow, and placement guidance", async ({ page }) => {
    await page.goto("/recommendation-proof?template=resale-exec-1990s&compass=255&floor=11&scenario=just-moved-in");

    await expect(page.getByRole("heading", { name: "Place these. Leave that clear." })).toBeVisible();
    await expect(page.getByTestId("recommendation-proof-flow")).toContainText("Prototype visualisation");
    await expect(page.getByLabel("resale-exec-1990s recommendation proof plan")).toBeVisible();
    await expect(page.getByTestId("recommendation-proof-actions")).toContainText("Shaft Buffer");
    await expect(page.getByTestId("recommendation-proof-actions")).toContainText("Tall cabinet or dense plant");
    await expect(page.getByTestId("recommendation-proof-actions")).toContainText("Fan Anchor");
    await expect(page.getByTestId("recommendation-proof-actions")).toContainText("Quiet standing fan");
    await expect(page.getByTestId("recommendation-proof-actions")).toContainText("Anti-Cure");
    await expect(page.getByTestId("recommendation-proof-actions")).toContainText("No built-in furniture");
    await expect(page.getByLabel("House Changelog")).toContainText("pipeshaft jet deflected.");
    await expect(page.getByLabel("Sketch comparison")).toContainText("Image 1: locked greybox anchor");
    await expect(page.getByLabel("Sketch comparison")).toContainText("Image 2: topology proof");

    const lifePanel = page.getByTestId("life-sketch-materialization");
    await expect(lifePanel).toContainText("Life Sketch accepted");
    await expect(lifePanel).toContainText("accepted-gpt-image-2-prebake");
    await expect(lifePanel).toContainText("3 candidates");
    await expect(lifePanel).toContainText(/accepted [0-2]/);
  });

  test("links from the Studio with the threshold readings intact", async ({ page }) => {
    await page.goto("/studio?template=resale-exec-1990s&compass=255&floor=11&scenario=just-moved-in");

    const proofLink = page.getByRole("link", { name: "Recommendation proof" });
    await expect(proofLink).toHaveAttribute(
      "href",
      "/recommendation-proof?template=resale-exec-1990s&compass=255&floor=11&scenario=just-moved-in",
    );
  });
});
