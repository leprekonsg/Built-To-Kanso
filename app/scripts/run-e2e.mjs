import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, closeSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "node:net";
import { processExitCode } from "./process-result.mjs";

const port = process.env.PORT ?? "3030";
const baseUrl = `http://127.0.0.1:${port}`;
const nextBin = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const playwrightCli = join(process.cwd(), "node_modules", "@playwright", "test", "cli.js");
const production = process.argv.includes("--production");
const serverMode = production ? "start" : "dev";
const reportDir = join(process.cwd(), "output", production ? "e2e-production" : "e2e-development");
mkdirSync(reportDir, { recursive: true });
rmSync(join(reportDir, "results.json"), { force: true });
if (production && !existsSync(join(process.cwd(), ".next", "BUILD_ID"))) {
  throw new Error("Production build missing. Run npm run build before npm run test:e2e:production.");
}

if (!existsSync(nextBin)) {
  console.error(`Next.js CLI not found at ${nextBin}. Run npm install first.`);
  process.exit(1);
}

if (!existsSync(playwrightCli)) {
  console.error(`Playwright CLI not found at ${playwrightCli}. Run npm install first.`);
  process.exit(1);
}

// Never use a pre-existing server as evidence for this checkout/build.
await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", () => reject(new Error(`Port ${port} is unavailable. Set PORT to an unused port and rerun.`)));
  probe.listen(Number(port), "127.0.0.1", () => probe.close(resolve));
});

const serverLog = openSync(join(reportDir, "server.log"), "w");
const server = spawn(process.execPath, [nextBin, serverMode, "--port", port], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["ignore", serverLog, serverLog],
  windowsHide: true,
});
closeSync(serverLog);
let serverError;
server.once("error", (error) => { serverError = error; });
server.unref();

let stopped = false;

function stopServer() {
  if (stopped) return;
  stopped = true;
  if (server.exitCode !== null || !server.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    server.unref();
    return;
  }
  try {
    server.kill("SIGTERM");
  } catch {
    // Server already exited.
  }
}

async function waitForReady() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (serverError) throw serverError;
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error(`Next ${serverMode} server exited early. See ${reportDir}/server.log.`);
    }
    try {
      const response = await fetch(`${baseUrl}/threshold`);
      if (response.ok) return;
    } catch {
      // Not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Next ${serverMode} server did not become ready at ${baseUrl}/threshold. See ${reportDir}/server.log.`);
}

async function main() {
  try {
    await waitForReady();
    const cliArgs = process.argv.slice(2).filter((arg) => arg !== "--production");
    const hasWorkerOverride = cliArgs.some((arg, index) =>
      arg === "--workers" || arg.startsWith("--workers=") || cliArgs[index - 1] === "--workers",
    );
    const args = ["test", ...cliArgs, ...(hasWorkerOverride ? [] : ["--workers=1"])];
    const result = spawnSync(process.execPath, [playwrightCli, ...args], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: port,
        PLAYWRIGHT_SKIP_WEBSERVER: "1",
        PLAYWRIGHT_REPORT_DIR: reportDir,
      },
      stdio: "inherit",
      windowsHide: true,
    });
    process.exitCode = processExitCode(result);
  } finally {
    stopServer();
  }
  process.exit(process.exitCode ?? 0);
}

process.once("SIGINT", () => {
  stopServer();
  process.exit(130);
});

process.once("SIGTERM", () => {
  stopServer();
  process.exit(143);
});

process.once("exit", stopServer);

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
  stopServer();
});
