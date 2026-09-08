import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { rasterizeSvgToPng } from "@/server/openai/svgRaster";
import { resolveCurrentPlanSketchArtifact } from "./planSketchAsset";
import { buildWindBaseMetadata, getWindBaseCachePath, resolveWindBaseArtifact } from "./windBaseAsset";
import { POST } from "@/app/api/sketches/wind-base/route";

describe("Wind backgrounds preserve source provenance", () => {
  let root: string;
  let png: Buffer;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "kanso-wind-provenance-"));
    const dir = join(root, "plan-sketches", "tengah-5room");
    await mkdir(dir, { recursive: true });
    for (const file of ["plan.png", "plan.json"]) {
      await writeFile(join(dir, file), await readFile(join(process.cwd(), "public", "plan-sketches", "tengah-5room", file)));
    }
    const rendered = await rasterizeSvgToPng('<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024"><rect width="1536" height="1024" fill="#F5F1E8"/></svg>', 1536);
    assert.ok(rendered.ok);
    png = rendered.png;
    const topology = await resolveCurrentPlanSketchArtifact("tengah-5room", root);
    assert.ok(topology);
    const cache = getWindBaseCachePath("tengah-5room", root);
    await mkdir(cache.directory, { recursive: true });
    await writeFile(cache.absolutePath, png);
    await writeFile(cache.metadataAbsolutePath, JSON.stringify(buildWindBaseMetadata("tengah-5room", topology, png, "gpt-image-2")));
  });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("serves a background bound to the current proof and exact PNG", async () => {
    const result = await resolveWindBaseArtifact("tengah-5room", root);
    assert.ok(result);
    assert.deepEqual(result.png, png);
  });

  it("rejects missing background provenance", async () => {
    await rm(getWindBaseCachePath("tengah-5room", root).metadataAbsolutePath);
    assert.equal(await resolveWindBaseArtifact("tengah-5room", root), null);
  });

  it("rejects a background when its source proof changes", async () => {
    await writeFile(join(root, "plan-sketches", "tengah-5room", "plan.png"), png);
    assert.equal(await resolveWindBaseArtifact("tengah-5room", root), null);
  });

  it("rejects mismatched background bytes", async () => {
    const changed = Buffer.from(png);
    changed[40] ^= 1;
    await writeFile(getWindBaseCachePath("tengah-5room", root).absolutePath, changed);
    assert.equal(await resolveWindBaseArtifact("tengah-5room", root), null);
  });

  it("returns an actionable 400 for a null request body", async () => {
    const response = await POST(new Request("http://localhost/api/sketches/wind-base", { method: "POST", body: "null" }));
    assert.equal(response.status, 400);
  });
});
