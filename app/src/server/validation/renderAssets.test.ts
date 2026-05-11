import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  expectedRenderAssets,
  readPngMetadata,
  validateExpectedRenderAssets,
  validateRenderAsset,
} from "./renderAssets";

describe("render asset validation", () => {
  it("reads PNG dimensions from IHDR", () => {
    const png = makePngHeader(320, 180);

    assert.deepEqual(readPngMetadata(png), { width: 320, height: 180 });
  });

  it("rejects corrupt PNG bytes with an actionable issue", () => {
    const result = validateRenderAsset(
      {
        id: "bad",
        kind: "plan_sketch",
        relativePath: "plan-sketches/bad/plan.png",
        minWidth: 1000,
        minHeight: 800,
        minBytes: 20_000,
      },
      Buffer.from("not a png"),
    );

    assert.equal(result.ok, false);
    assert.match(result.issues.join("\n"), /Regenerate the local\/prebaked asset/);
  });

  it("validates every committed Phase 1 local/prebaked render asset", async () => {
    const report = await validateExpectedRenderAssets();

    assert.equal(report.ok, true, report.assets.flatMap((asset) => asset.issues).join("\n"));
    assert.equal(report.assetCount, 13);
    assert.equal(report.assetCount, expectedRenderAssets().length);
    assert.ok(report.assets.some((asset) => asset.relativePath === "references/brand-v3-poster.png"));
    assert.ok(report.assets.some((asset) => asset.relativePath === "references/hdb-material-board.png"));
  });
});

function makePngHeader(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}
