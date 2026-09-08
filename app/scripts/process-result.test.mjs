import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { processExitCode } from "./process-result.mjs";

test("launch errors cannot report success", () => {
  const result = spawnSync("kanso-test-nonexistent-executable-84732", [], { shell: false });
  assert.equal(result.error?.code, "ENOENT");
  assert.throws(() => processExitCode(result), { code: "ENOENT" });
});

test("only an explicit zero exit status succeeds", () => {
  assert.equal(processExitCode({ status: 0 }), 0);
  assert.equal(processExitCode({ status: 3 }), 3);
  assert.equal(processExitCode({ status: null, signal: "SIGTERM" }), 1);
  assert.equal(processExitCode({ status: null, signal: null }), 1);
});
