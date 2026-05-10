import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const port = process.argv[2] ?? process.env.PORT ?? "3030";
const nextBin = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");

if (!existsSync(nextBin)) {
  console.error(`Next.js CLI not found at ${nextBin}. Run npm install first.`);
  process.exit(1);
}

const child = spawn(process.execPath, [nextBin, "dev", "--port", port], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "ignore",
  windowsHide: true,
});

let shuttingDown = false;

function stopChild() {
  if (shuttingDown) return;
  shuttingDown = true;

  if (child.exitCode === null && child.pid) {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      try {
        child.kill("SIGTERM");
      } catch {
        // Child already exited.
      }
    }
  }
}

child.once("exit", (code, signal) => {
  if (!shuttingDown) {
    process.exitCode = code ?? (signal ? 1 : 0);
    process.exit();
  }
});

process.once("SIGINT", () => {
  stopChild();
  process.exit(130);
});

process.once("SIGTERM", () => {
  stopChild();
  process.exit(143);
});

process.once("exit", stopChild);

setInterval(() => {
  // Keep wrapper alive while Playwright owns the webServer lifecycle.
}, 30_000).unref();
