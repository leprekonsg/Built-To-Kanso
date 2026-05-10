import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GET } from "./route";

describe("/api/validation/render-assets", () => {
  it("reports committed local/prebaked render assets", async () => {
    const response = await GET();
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true, body.assets.flatMap((asset: { issues: string[] }) => asset.issues).join("\n"));
    assert.equal(body.assetCount, 11);
    assert.equal(body.failedCount, 0);
  });
});
