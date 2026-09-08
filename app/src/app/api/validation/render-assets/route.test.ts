import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GET } from "./route";

describe("/api/validation/render-assets", () => {
  it("reports committed local/prebaked render assets", async () => {
    const response = await GET();
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, false);
    assert.equal(body.assetCount, 18);
    assert.ok(body.failedCount >= 3);
    for (const id of ["tampines-greenweave", "tengah-5room", "resale-exec-1990s"]) {
      assert.equal(body.assets.find((asset: { relativePath: string }) => asset.relativePath === `life-sketches/${id}/accepted.png`)?.ok, false);
    }
    assert.ok(body.byTemplate.some((template: { templateId: string; assetCount: number }) => template.templateId === "tampines-greenweave" && template.assetCount === 5));
    assert.ok(body.assets.some((asset: { relativePath: string }) => asset.relativePath === "life-sketches/tampines-greenweave/accepted.png"));
    assert.ok(body.assets.some((asset: { relativePath: string }) => asset.relativePath === "wind-base/tampines-greenweave/base.png"));
    assert.ok(body.assets.some((asset: { relativePath: string }) => asset.relativePath === "resonance-hour/tampines-greenweave/accepted.png"));
    assert.ok(body.assets.some((asset: { relativePath: string }) => asset.relativePath === "references/brand-v3-poster.png"));
    assert.ok(body.assets.some((asset: { relativePath: string }) => asset.relativePath === "references/hdb-material-board.png"));
  });
});
