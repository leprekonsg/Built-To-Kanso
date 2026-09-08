import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3030);
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === "1";
const reportDir = process.env.PLAYWRIGHT_REPORT_DIR ?? "output/e2e-development";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    [process.env.CI ? "github" : "list"],
    ["json", { outputFile: `${reportDir}/results.json` }],
    ["html", { outputFolder: `${reportDir}/html`, open: "never" }],
  ],
  outputDir: `${reportDir}/artifacts`,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: skipWebServer
    ? undefined
    : {
        command: `node ./scripts/playwright-web-server.mjs ${PORT}`,
        url: `http://localhost:${PORT}/threshold`,
        reuseExistingServer: true,
        timeout: 120_000,
        gracefulShutdown: { signal: "SIGTERM", timeout: 2_000 },
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1100 } },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
