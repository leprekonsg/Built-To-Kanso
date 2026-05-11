import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const APP_ROOT = process.cwd();
const REPO_ROOT = resolve(APP_ROOT, "..");

describe("operational secret hygiene", () => {
  it("keeps local env files ignored at repo root and app root", async () => {
    const rootIgnore = await readFile(resolve(REPO_ROOT, ".gitignore"), "utf8");
    const appIgnore = await readFile(resolve(APP_ROOT, ".gitignore"), "utf8");

    assert.match(rootIgnore, /^\.env$/m);
    assert.match(rootIgnore, /^\.env\.\*$/m);
    assert.match(appIgnore, /^\.env$/m);
    assert.match(appIgnore, /^\.env\.local$/m);
    assert.match(appIgnore, /^\.env\.\*\.local$/m);
  });

  it("documents demo credential posture without checking secrets into source", async () => {
    const checklist = await readFile(resolve(REPO_ROOT, "built-to-kanso-v4_1-checklist.txt"), "utf8");

    assert.match(checklist, /Operational secrets and credentials are intentionally not checked into the repo/);
    assert.match(checklist, /R2 and VAPID are not required for the demo path/);
    assert.match(checklist, /OPENAI_API_KEY configured.*intentionally not committed/);
    assert.match(checklist, /VAPID\/Web Push demo posture.*waived for demo/);
  });
});
