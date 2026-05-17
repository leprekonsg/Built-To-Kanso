import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GET } from "./route";

describe("/api/validation/render-assets", () => {
  it("reports committed local/prebaked render assets", async () => {
    const response = await GET();
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true, body.assets.flatMap((asset: { issues: string[] }) => asset.issues).join("\n"));
    assert.equal(body.assetCount, 18);
    assert.equal(body.failedCount, 0);
    assert.ok(body.byTemplate.some((template: { templateId: string; assetCount: number }) => template.templateId === "tampines-greenweave" && template.assetCount === 5));
    assert.ok(body.assets.some((asset: { relativePath: string }) => asset.relativePath === "life-sketches/tampines-greenweave/accepted.png"));
    assert.ok(body.assets.some((asset: { relativePath: string }) => asset.relativePath === "wind-base/tampines-greenweave/base.png"));
    assert.ok(body.assets.some((asset: { relativePath: string }) => asset.relativePath === "resonance-hour/tampines-greenweave/accepted.png"));
    assert.ok(body.assets.some((asset: { relativePath: string }) => asset.relativePath === "references/brand-v3-poster.png"));
    assert.ok(body.assets.some((asset: { relativePath: string }) => asset.relativePath === "references/hdb-material-board.png"));
  });
});
