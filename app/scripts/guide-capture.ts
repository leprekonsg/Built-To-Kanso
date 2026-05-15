import { chromium, type Locator, type Page } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOTS = path.resolve(__dirname, "..", "guide-output", "screenshots");
const BASE_URL = process.env.GUIDE_BASE_URL ?? "http://localhost:3000";

interface ShotOpts {
  fullPage?: boolean;
  settleMs?: number;
}

async function shot(page: Page, name: string, opts: ShotOpts = {}): Promise<void> {
  await page.waitForTimeout(opts.settleMs ?? 600);
  await page.screenshot({
    path: path.join(SCREENSHOTS, `${name}.png`),
    fullPage: opts.fullPage ?? false,
  });
  console.log(`  saved ${name}.png`);
}

// scrollIntoViewIfNeeded uses block:'nearest' and may place the element at the
// bottom of the viewport. This helper always aligns to block:'start' so the
// target sits at the top of the frame before a screenshot.
async function scrollTop(locator: Locator): Promise<void> {
  await locator.evaluate((el) => el.scrollIntoView({ block: "start", behavior: "instant" }));
}

// For sections taller than the default 800px viewport, temporarily expand the
// viewport height so the full section clears the frame, then restore it.
async function shotSection(page: Page, name: string, sectionHeight = 1200): Promise<void> {
  await page.setViewportSize({ width: 1280, height: sectionHeight });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SCREENSHOTS, `${name}.png`) });
  await page.setViewportSize({ width: 1280, height: 800 });
  console.log(`  saved ${name}.png`);
}

async function main(): Promise<void> {
  if (!existsSync(SCREENSHOTS)) mkdirSync(SCREENSHOTS, { recursive: true });

  // Headless Chromium has no GPU adapter, so the Tier-1 LBM probe in
  // runTier1IfAvailable returns null and Tier-4 prebaked results take over —
  // exactly the brief's silent fallback. Chromium still emits a
  // "No available adapters." page warning when requestAdapter() is called; we
  // filter it below since the fallback is the intended behavior.
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  });

  // Inject CSS into every page so the Next.js dev-mode chrome (corner pill,
  // error toasts, overlay) never bleeds into a user-guide screenshot.
  await context.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = `
      nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog-overlay],
      [data-nextjs-call-stack-frame], #__next-build-watcher,
      #__next-dev-overlay-error, [data-nextjs-dev-tools-button] {
        display: none !important;
        visibility: hidden !important;
      }
    `;
    const apply = () => document.documentElement.appendChild(style);
    if (document.body) apply();
    else document.addEventListener("DOMContentLoaded", apply, { once: true });
  });

  const page = await context.newPage();

  // Surface console warnings/errors so we know what the dev indicator was
  // flagging. These do not block capture; the dev overlay is hidden anyway.
  // The "No available adapters." WebGPU warning is the documented Tier-4
  // fallback path under headless Chromium — drop it from the pipe so the
  // capture log only carries actionable noise.
  page.on("console", (msg) => {
    const t = msg.type();
    if (t !== "error" && t !== "warning") return;
    const text = msg.text();
    if (text.includes("No available adapters")) return;
    console.log(`  [page ${t}] ${text}`);
  });

  try {
    console.log(`Capturing against ${BASE_URL}`);

    // 01 — Threshold landing (Stage 1 fresh view).
    await page.goto(`${BASE_URL}/threshold`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: /Step over the/ }).waitFor();
    await shot(page, "01-threshold-landing", { fullPage: true });

    // 02 — Pick a template (Tampines GreenWeave).
    await page
      .getByRole("button", { name: /Tampines GreenWeave/i })
      .click();
    await shot(page, "02-template-selected");

    // 03 — Door direction. Focus the compass slider and arrow-press to 120 deg.
    const compass = page.locator('svg[role="slider"][aria-label="Door facing direction"]');
    await compass.focus();
    for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowRight");
    await page.getByText("120°", { exact: false }).first().waitFor();
    await shot(page, "03-compass-set");

    // 04 — Floor. Slider starts at 11; arrow up to 14 (Golden Floors tier).
    const slider = page.locator('input[type="range"][aria-label="Floor level"]');
    await slider.focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
    await shot(page, "04-floor-set");

    // 05 — Scenario chosen; Continue becomes ready.
    await page.getByRole("radio", { name: /Just moved in/i }).click();
    await page.getByText("All four set. The house is listening.").waitFor();
    await shot(page, "05-scenario-set-continue-ready", { fullPage: true });

    // 06 — Studio hero. Click Continue and wait for the next route.
    await Promise.all([
      page.waitForURL(/\/studio\?/),
      page.getByRole("link", { name: /Continue/i }).click(),
    ]);
    await page.getByRole("heading", { name: "The house is listening." }).waitFor();
    // Let the plan SVG and inputs strip settle.
    await page.waitForTimeout(800);
    await shot(page, "06-bones-hero");

    // 07 — Asking points (Damp Risk, Anti-cure). Up to three items plus the
    // Damp Reading card can exceed 800px; expand viewport so nothing is clipped.
    await scrollTop(page.getByText("What the home is asking", { exact: true }));
    await shotSection(page, "07-bones-asking-points");

    // 08 — LiveStudio (airflow visual region).
    await scrollTop(page.getByRole("region", { name: "LiveStudio" }));
    await shot(page, "08-bones-livestudio");

    // 09 — Weather Trial click swaps studio conditions deterministically.
    const trial = page.getByTestId("weather-trial-west_sun_1720");
    await scrollTop(trial);
    await trial.click();
    await page.waitForSelector('[data-weather-trial="west_sun_1720"]');
    await shot(page, "09-weather-trial-active");

    // 10 — Recommendation Proof (Stage 6) hero.
    const qs = "?template=tampines-greenweave&compass=120&floor=14&scenario=just-moved-in";
    await page.goto(`${BASE_URL}/recommendation-proof${qs}`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: /Place these\. Leave that clear\./ }).waitFor();
    await page.waitForTimeout(800);
    await shot(page, "10-proof-hero");

    // 11 — Three action cards. All three cards with their footers exceed 800px;
    // expand the viewport so no card is clipped at the bottom.
    await scrollTop(page.getByRole("heading", { name: /Three decisions, one receipt\./ }));
    await shotSection(page, "11-proof-actions");

    // 12 — House Changelog + sketch comparison. scroll:'nearest' would leave the
    // action cards visible at top; block:'start' anchors the changelog heading.
    await scrollTop(page.getByText("House Changelog").first());
    await shotSection(page, "12-proof-changelog");

    // 13 — Wind Sketch (Stage 6, the third sketch). The polish=1 path runs
    // the full brief Section 6 pipeline: Stage A LBM solve → Stage B GPT-styled
    // sumi-e top-down background (when public/wind-base/<id>/base.png is
    // present) → Stage C deterministic SVG composition → Stage D GPT micro-
    // polish. The response header X-Wind-Stage-B reports whether Stage B
    // landed; we require it to ensure the guide captures the full pipeline.
    const windRes = await fetch(`${BASE_URL}/api/sketches/wind?polish=1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: "tampines-greenweave",
        tokenPlacements: [],
        condition: "ne_monsoon",
      }),
    });
    if (!windRes.ok) {
      throw new Error(`Wind Sketch endpoint returned ${windRes.status}`);
    }
    const windContentType = windRes.headers.get("Content-Type") ?? "";
    if (!windContentType.startsWith("image/png")) {
      const fallback = windRes.headers.get("X-Sketch-Fallback") ?? "unknown";
      throw new Error(
        `Wind Sketch polish=1 returned ${windContentType} (fallback: ${fallback}); set OPENAI_API_KEY and ensure the route reached Stage D.`,
      );
    }
    const windStageB = windRes.headers.get("X-Wind-Stage-B") ?? "none";
    if (windStageB === "none") {
      throw new Error(
        "Wind Sketch returned without Stage B background. Run `npm run prebake:wind-base` before capturing the guide.",
      );
    }
    const windBytes = Buffer.from(await windRes.arrayBuffer());
    writeFileSync(path.join(SCREENSHOTS, "13-wind-sketch.png"), windBytes);
    console.log(`  saved 13-wind-sketch.png (stage-b=${windStageB})`);

    // 14 — Resonance Hour (the closing image; brief Section 20/21). 3D Life
    // Sketch with evening wind cues — curtain lift, dust motes, leaf tilt.
    // Wind is implied through environmental change, never drawn as arrows.
    const resonanceRes = await fetch(`${BASE_URL}/api/sketches/resonance-hour`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId: "tampines-greenweave" }),
    });
    if (!resonanceRes.ok) {
      throw new Error(`Resonance Hour endpoint returned ${resonanceRes.status}`);
    }
    const resonanceSource = resonanceRes.headers.get("X-Sketch-Source") ?? "unknown";
    if (resonanceSource !== "resonance-hour-background") {
      const fallback = resonanceRes.headers.get("X-Sketch-Fallback") ?? "none";
      throw new Error(
        `Resonance Hour returned source=${resonanceSource} (fallback=${fallback}). Run `
          + "`npm run prebake:resonance-hour` so the closing frame is the polished still, not a passthrough.",
      );
    }
    const resonanceBytes = Buffer.from(await resonanceRes.arrayBuffer());
    writeFileSync(path.join(SCREENSHOTS, "14-resonance-hour.png"), resonanceBytes);
    console.log("  saved 14-resonance-hour.png");

    // 15 — Methodology hero.
    await page.goto(`${BASE_URL}/methodology`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "How the house is read." }).waitFor();
    await shot(page, "15-methodology-hero");

    // 16 — Evidence ladder section. Five tiers run past 800px; expand viewport
    // so the full ladder is captured without cutting the last row.
    await scrollTop(page.locator("#evidence"));
    await shotSection(page, "16-methodology-evidence");
  } finally {
    await browser.close();
  }
}

main().catch((err: unknown) => {
  console.error("Screenshot capture failed:", err);
  process.exit(1);
});
