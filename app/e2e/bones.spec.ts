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
    await expect(page.getByRole("region", { name: "Weather Trial" })).toContainText("West Sun 17:20");
    await expect(page.getByRole("region", { name: "Weather Trial" })).toContainText("Highway Night");
    await expect(page.getByRole("region", { name: "Weather Trial" })).toContainText("NE Monsoon Wind");

    await expect(page.getByRole("region", { name: "Glow, Quiet, and Damp checks" })).toContainText("Glow");
    await expect(page.getByRole("region", { name: "Glow, Quiet, and Damp checks" })).toContainText("Quiet");
    await expect(page.getByRole("region", { name: "Glow, Quiet, and Damp checks" })).toContainText("Damp");
    await expect(page.getByText(/severity|scanner|defect backlog/i)).not.toBeVisible();

    await page.getByRole("tab", { name: "Designer" }).click();

    await expect(page.getByRole("term").filter({ hasText: "Material preset" })).toBeVisible();
    await expect(page.getByText("Audit overlay")).toBeVisible();
    await expect(page.getByText("Quantity readout")).toBeVisible();
    await expect(page.getByText(/ACH estimate/i)).toBeVisible();
    await expect(page.getByText(/SHGC <= 0\.30 recommended/i).first()).toBeVisible();
  });

  test("renders LiveStudio scene elements from the deterministic airflow field", async ({ page }) => {
    await page.goto("/bones?template=resale-exec-1990s&compass=255&floor=11&scenario=just-moved-in");

    const liveStudio = page.getByTestId("live-studio");
    await expect(liveStudio).toContainText("Tier 4 airflow visual. Prototype visualisation.");

    const sceneLayer = page.getByTestId("scene-elements");
    await expect(sceneLayer).toBeVisible();
    await expect(page.getByTestId("curtain-living_window")).toBeVisible();
    await expect(page.getByTestId("curtain-master_window")).toBeVisible();
    await expect(page.locator('[data-testid^="leaf-leaf-"]')).toHaveCount(2);

    const kitchenShadow = page.getByTestId("kitchen-shadow");
    await expect(kitchenShadow).toBeVisible();
    await expect(kitchenShadow).toHaveAttribute("data-frame-index", /^[0-7]$/);
    await expect(kitchenShadow).toHaveAttribute("fill", /^url\(#kitchen-shadow-frame-[0-7]\)$/);

    const curtain = page.getByTestId("curtain-living_window");
    const initialTransform = await curtain.evaluate((element) => (element as SVGElement).style.transform);
    await page.getByTestId("wind-visibility-slider").fill("100");
    await expect
      .poll(() => curtain.evaluate((element) => (element as SVGElement).style.transform))
      .not.toBe(initialTransform);
    await expect(sceneLayer).toHaveAttribute("style", /--scene-gain: 1\.00/);
  });

  test("Material System slider distinguishes Barely Seen from Clearly Seen", async ({ page }) => {
    await page.goto("/bones?template=resale-exec-1990s&compass=255&floor=11&scenario=just-moved-in");

    const slider = page.getByTestId("wind-visibility-slider");
    const materials = page.getByTestId("simulation-materials");
    const sceneLayer = page.getByTestId("scene-elements");
    const curtain = page.getByTestId("curtain-living_window");

    await expect(page.getByText("Barely Seen")).toBeVisible();
    await expect(page.getByText("Clearly Seen")).toBeVisible();

    await slider.fill("0");
    await expect(slider).toHaveAttribute("aria-valuetext", "Barely Seen");
    await expect(sceneLayer).toHaveAttribute("style", /--scene-gain: 0\.00/);

    const barely = await materials.evaluate((element) => ({
      opacity: element.getAttribute("style") ?? "",
      curtainTransform: (document.querySelector('[data-testid="curtain-living_window"]') as SVGElement | null)?.style.transform ?? "",
    }));

    await slider.fill("100");
    await expect(slider).toHaveAttribute("aria-valuetext", "Clearly Seen");
    await expect(sceneLayer).toHaveAttribute("style", /--scene-gain: 1\.00/);
    await expect(materials).toHaveAttribute("style", /--wind-opacity: 0\.94/);
    await expect(materials).toHaveAttribute("style", /--streamline-width: 0\.090/);
    await expect
      .poll(() => curtain.evaluate((element) => (element as SVGElement).style.transform))
      .not.toBe(barely.curtainTransform);

    const clearly = await materials.evaluate((element) => element.getAttribute("style") ?? "");
    expect(clearly).not.toBe(barely.opacity);
  });

  test("supports token personality variants without changing legality", async ({ page }) => {
    await page.goto("/bones?template=resale-exec-1990s&compass=255&floor=11&scenario=just-moved-in");

    await expect(page.getByLabel("Token personality")).toHaveValue("wabi_sabi");
    await expect(page.getByText("Weathered ceramic, linen, quiet repair.")).toBeVisible();

    await page.getByLabel("Token personality").selectOption("tropical_modernist");
    await expect(page.getByText("Cane, shade cloth, pale timber, strong cross-breeze.")).toBeVisible();

    await page.getByRole("button", { name: /Wind Gate/ }).click();
    await clickPlanPoint(page, { x: 13.25, y: 7.25 });
    await expect(page.getByText("This wall is not asking to be changed. HDB fixed elements stay untouched.")).toBeVisible();
  });

  test("Designer mode exposes the full material parameter set per brief 5.2", async ({ page }) => {
    await page.goto("/bones?template=resale-exec-1990s&compass=255&floor=11&scenario=just-moved-in");
    await page.getByRole("tab", { name: "Designer" }).click();

    const controls = page.getByTestId("designer-controls");
    await expect(controls).toBeVisible();
    // All 8 brief parameters render with stable testids.
    await expect(page.getByTestId("designer-control-preset")).toBeVisible();
    await expect(page.getByTestId("designer-control-visibility")).toBeVisible();
    await expect(page.getByTestId("designer-control-density")).toBeVisible();
    await expect(page.getByTestId("designer-control-turbulence")).toBeVisible();
    await expect(page.getByTestId("designer-control-softness")).toBeVisible();
    await expect(page.getByTestId("designer-control-velocityWidthMod")).toBeVisible();
    await expect(page.getByTestId("designer-control-stagnationOpacityThreshold")).toBeVisible();
    await expect(page.getByTestId("designer-control-textureScale")).toBeVisible();

    // Designer-supplied visibility cedes the in-studio slider; badge is visible.
    await expect(page.getByTestId("designer-overrides-badge")).toBeVisible();
    await expect(page.getByTestId("wind-visibility-slider")).toBeDisabled();

    // Preset + density + textureScale flow through to the legacy detail card.
    await page.getByTestId("designer-control-preset").selectOption("audit_lic");
    await page.getByTestId("designer-control-density").fill("82");
    await page.getByTestId("designer-control-textureScale").fill("31");

    await expect(page.getByRole("definition").filter({ hasText: "audit_lic" })).toBeVisible();
    await expect(page.getByText("stream 82%")).toBeVisible();
    await expect(page.getByText("dust 31%")).toBeVisible();
  });

  test("Designer mode persists controls to localStorage across reloads", async ({ page }) => {
    await page.goto("/bones?template=resale-exec-1990s&compass=255&floor=11&scenario=just-moved-in");
    await page.getByRole("tab", { name: "Designer" }).click();

    await page.getByTestId("designer-control-preset").selectOption("sumi_ink");
    await page.getByTestId("designer-control-turbulence").fill("77");

    const stored = await page.evaluate(() =>
      window.localStorage.getItem("built-to-kanso:designer-controls"),
    );
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored ?? "{}");
    expect(parsed.preset).toBe("sumi_ink");
    expect(parsed.turbulence).toBe(77);

    await page.reload();
    await page.getByRole("tab", { name: "Designer" }).click();
    await expect(page.getByTestId("designer-control-preset")).toHaveValue("sumi_ink");
    await expect(page.getByTestId("designer-control-turbulence")).toHaveValue("77");
  });

  test("edits a reversible floor-plan draft and keeps Black-state elements locked", async ({ page }) => {
    await page.goto("/bones?template=resale-exec-1990s&compass=255&floor=11&scenario=just-moved-in");

    await page.getByRole("button", { name: "Edit plan draft" }).click();
    await expect(page.getByRole("region", { name: "Reversible floor plan editor" })).toBeVisible();

    await page.getByLabel("Editable room").selectOption("living_dining");
    await page.getByLabel("Room width").fill("4.4");
    await page.getByLabel("Room label").fill("Living draft");
    await page.getByRole("button", { name: "Apply preview" }).click();

    await expect(page.getByText("Draft preview applied. Source plan remains locked.")).toBeVisible();
    await expect(page.getByText("Living draft")).toBeVisible();

    await page.getByLabel("Locked fixed element").selectOption("household_shelter_black");
    await page.getByRole("button", { name: "Try editing locked element" }).click();
    await expect(page.getByText("This wall is not asking to be changed. HDB fixed elements stay untouched.")).toBeVisible();

    await page.getByRole("button", { name: "Reset draft" }).click();
    await expect(page.getByText("Living draft")).not.toBeVisible();
  });

  test("committed tokens update Damp Risk, Kanso Reserve, and House Changelog", async ({ page }) => {
    await page.goto("/bones?template=resale-exec-1990s&compass=255&floor=11&scenario=just-moved-in");

    const reserveCard = page.locator("section").filter({ hasText: "Reserve" }).first();
    const reserveValue = reserveCard.getByText(/^\d+% empty$/);
    const beforeReserve = await reserveValue.textContent();
    await page.getByRole("button", { name: /Shaft Buffer/ }).click();
    await clickPlanPoint(page, { x: 5.4, y: 3.95 });

    await expect(page.getByText(/Watch Damp Risk/)).toBeVisible();
    await expect(page.getByText("1 bedroom shares this damp recommendation.")).toBeVisible();
    await expect(page.getByText("pipeshaft jet deflected.")).toBeVisible();
    await expect(page.getByText(/Damp Risk is a layout-based comfort estimate/).first()).toBeVisible();
    await expect(page.locator('svg[role="application"]')).toHaveAttribute("aria-label", /with 1 placed tokens/);

    const afterReserve = await reserveValue.textContent();
    expect(afterReserve).not.toBe(beforeReserve);
  });
});

async function clickPlanPoint(page: import("@playwright/test").Page, point: { x: number; y: number }) {
  const canvas = page.locator('svg[role="application"]');
  await canvas.scrollIntoViewIfNeeded();
  const position = await canvas.evaluate((svg, target) => {
    const planSvg = svg as SVGSVGElement;
    const rect = planSvg.getBoundingClientRect();
    const svgPoint = planSvg.createSVGPoint();
    svgPoint.x = target.x;
    svgPoint.y = target.y;
    const matrix = planSvg.getScreenCTM();
    if (!matrix) throw new Error("plan canvas is not mounted");
    const viewportPoint = svgPoint.matrixTransform(matrix);
    return {
      x: viewportPoint.x - rect.left,
      y: viewportPoint.y - rect.top,
    };
  }, point);
  await canvas.click({ position });
}
