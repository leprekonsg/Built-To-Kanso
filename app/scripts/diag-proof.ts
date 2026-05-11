import { chromium } from "@playwright/test";

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true, args: ["--disable-features=WebGPU"] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const qs = "?template=tampines-greenweave&compass=120&floor=14&scenario=just-moved-in";
  await page.goto(`http://localhost:3000/recommendation-proof${qs}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "guide-output/diagnose/proof-fullpage.png", fullPage: true });
  console.log("saved fullpage");
  await browser.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
