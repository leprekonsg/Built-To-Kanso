import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const port = process.env.PORT ?? "3030";
const baseUrl = `http://127.0.0.1:${port}`;
const nextBin = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const playwrightCli = join(process.cwd(), "node_modules", "@playwright", "test", "cli.js");

if (!existsSync(nextBin)) {
  console.error(`Next.js CLI not found at ${nextBin}. Run npm install first.`);
  process.exit(1);
}

if (!existsSync(playwrightCli)) {
  console.error(`Playwright CLI not found at ${playwrightCli}. Run npm install first.`);
  process.exit(1);
}

const server = spawn(process.execPath, [nextBin, "dev", "--port", port], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "ignore",
  windowsHide: true,
});
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
    if (server.exitCode !== null) {
      throw new Error(`Next dev server exited early with code ${server.exitCode}.`);
    }
    try {
      const response = await fetch(`${baseUrl}/threshold`);
      if (response.ok) return;
    } catch {
      // Not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Next dev server did not become ready at ${baseUrl}/threshold.`);
}

async function main() {
  try {
    await waitForReady();
    const cliArgs = process.argv.slice(2);
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
      },
      stdio: "inherit",
      windowsHide: true,
    });
    process.exitCode = result.status ?? (result.signal ? 1 : 0);
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
