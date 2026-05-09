import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashBytes, hashString } from "@/lib/imageHash";

describe("imageHash", () => {
  it("hashBytes is deterministic and 16 hex chars", () => {
    const a = hashBytes(Buffer.from("hello world", "utf8"));
    const b = hashBytes(Buffer.from("hello world", "utf8"));
    assert.equal(a, b);
    assert.match(a, /^[0-9a-f]{16}$/);
  });

  it("hashBytes diverges on different bytes", () => {
    const a = hashBytes(Buffer.from("hello", "utf8"));
    const b = hashBytes(Buffer.from("world", "utf8"));
    assert.notEqual(a, b);
  });

  it("hashString is deterministic and 16 hex chars", () => {
    const a = hashString("kanso-empty-bone");
    const b = hashString("kanso-empty-bone");
    assert.equal(a, b);
    assert.match(a, /^[0-9a-f]{16}$/);
  });

  it("hashString matches a known sha256 prefix", () => {
    // sha256("kanso") prefix — locks the algorithm so a future swap
    // would fail this test.
    assert.equal(hashString("kanso"), "abdee6ae366bb071");
  });
});
