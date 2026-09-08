import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { processExitCode } from "./process-result.mjs";

const appDir = process.cwd();
const reportDir = join(appDir, "output", "release-validation");
mkdirSync(reportDir, { recursive: true });
function git(...args) {
  const result = spawnSync("git", args, { cwd: appDir, encoding: "utf8" });
  if (processExitCode(result) !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr}`);
  return result.stdout.trim();
}
function sourceIdentity() {
  const files = git("ls-files", "--cached", "--others", "--exclude-standard", "-z",
    "src", "e2e", "scripts", "public", "package.json", "package-lock.json", "playwright.config.ts",
    "next.config.*", "tsconfig.json").split("\0").filter(Boolean).sort();
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file).update("\0");
    hash.update(existsSync(file) ? readFileSync(file) : "<deleted>").update("\0");
  }
  return { commit: git("rev-parse", "HEAD"), sourceSha256: hash.digest("hex"),
    workingTreeChanges: git("status", "--short"), fileCount: files.length };
}
const report = {
  schemaVersion: 1, startedAt: new Date().toISOString(), identity: sourceIdentity(),
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  scope: "Software containment and synthetic permitted paths; not source authenticity or physical validation.",
  commands: [], status: "running",
};
const save = () => writeFileSync(join(reportDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
save();
const commands = [
  ["runner", ["--test", "--test-reporter=tap", "scripts/*.test.mjs"]],
  ["unit", ["node_modules/tsx/dist/cli.mjs", "--test", "--test-reporter=tap", "src/**/*.test.ts"]],
  ["asset-audit", ["node_modules/tsx/dist/cli.mjs", "scripts/audit-release-assets.ts"]],
  ["build", ["node_modules/next/dist/bin/next", "build"]],
  ["typecheck", ["node_modules/typescript/bin/tsc", "--noEmit"]],
  ["browser-production", ["scripts/run-e2e.mjs", "--production"]],
];
try {
  for (const [name, args] of commands) {
    const startedAt = new Date().toISOString();
    console.log(`Running ${name}; log: output/release-validation/${name}.log`);
    const result = spawnSync(process.execPath, args, { cwd: appDir, encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024, windowsHide: true, env: process.env });
    const logPath = join(reportDir, `${name}.log`);
    writeFileSync(logPath, `${result.stdout ?? ""}\n${result.stderr ?? ""}`);
    const item = { name, command: [process.execPath, ...args], startedAt,
      finishedAt: new Date().toISOString(), exitCode: result.status ?? 1,
      log: relative(appDir, logPath), error: result.error?.message ?? null };
    report.commands.push(item);
    if (name === "runner" || name === "unit") {
      item.counts = {};
      for (const key of ["tests", "pass", "fail", "cancelled", "skipped", "todo"]) {
        const matches = [...(result.stdout ?? "").matchAll(new RegExp(`^# ${key} (\\d+)$`, "gm"))];
        item.counts[key] = matches.length ? Number(matches.at(-1)[1]) : null;
      }
      item.counts.flaky = 0; // Node test runs do not retry here.
    }
    if (name === "build" && result.status === 0) {
      report.buildId = readFileSync(join(appDir, ".next", "BUILD_ID"), "utf8").trim();
    }
    if (name === "asset-audit" && result.status === 0) {
      const audit = JSON.parse(readFileSync(join(reportDir, "asset-audit.json"), "utf8"));
      report.releaseReady = audit.releaseReady;
      report.releaseBlockers = audit.blockers;
      item.report = "output/release-validation/asset-audit.json";
    }
    if (name === "browser-production") {
      const jsonPath = join(appDir, "output", "e2e-production", "results.json");
      if (existsSync(jsonPath)) {
        const browser = JSON.parse(readFileSync(jsonPath, "utf8"));
        item.counts = browser.stats;
        item.projects = browser.config.projects.map((project) => ({ name: project.name, testDir: project.testDir }));
        item.results = relative(appDir, jsonPath);
        item.html = "output/e2e-production/html/index.html";
        item.artifacts = "output/e2e-production/artifacts";
        item.coverage = "Desktop Chromium and Pixel 7 emulated Chromium; no physical-device or WebKit validation.";
        item.skips = [];
        item.projectCounts = {};
        const visit = (suites) => { for (const suite of suites) {
          for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) {
            const counts = item.projectCounts[test.projectName] ??= { firstRunPass: 0, expectedFailure: 0, failed: 0, skipped: 0, flaky: 0 };
            if (test.status === "expected" && test.results[0]?.status === "passed") counts.firstRunPass++;
            else if (test.status === "expected") counts.expectedFailure++;
            else if (test.status === "unexpected") counts.failed++;
            else if (test.status === "flaky") counts.flaky++;
            else if (test.status === "skipped") counts.skipped++;
            if (test.status === "skipped") item.skips.push({ title: spec.title, project: test.projectName,
              annotations: test.annotations });
          }
          visit(suite.suites ?? []);
        } };
        visit(browser.suites);
      } else if (result.status === 0) {
        throw new Error("Browser runner returned success without a JSON report.");
      }
    }
    save();
    if (processExitCode(result) !== 0) throw new Error(`${name} failed. See ${logPath}`);
  }
  report.finalIdentity = sourceIdentity();
  if (report.finalIdentity.sourceSha256 !== report.identity.sourceSha256) {
    throw new Error("Source changed during validation. Run again on the final source.");
  }
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = error instanceof Error ? error.message : String(error);
  console.error(report.error);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  save();
  console.log(`Report: ${join(reportDir, "report.json")}`);
}
