import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { getPlanGeometry } from "@/server/geometry/registry";
import { renderTopologyProofSvg } from "@/server/openai/fallbackSvg";
import { buildPlanSketchCacheMetadata, getPlanSketchCachePath, resolveCurrentPlanSketchArtifact } from "./planSketchAsset";

const TEMPLATE = "tengah-5room";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==", "base64");

describe("current Plan Sketch provenance", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "kanso-plan-provenance-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function seed(source = renderTopologyProofSvg(getPlanGeometry(TEMPLATE)), png = PNG) {
    const cache = getPlanSketchCachePath(TEMPLATE, root);
    await mkdir(cache.directory, { recursive: true });
    await writeFile(cache.absolutePath, png);
    await writeFile(cache.metadataAbsolutePath, JSON.stringify(buildPlanSketchCacheMetadata(TEMPLATE, source, png)));
    return cache;
  }

  it("accepts verified prebake bytes without reproducing the host rasterizer's output", async () => {
    await seed();
    const artifact = await resolveCurrentPlanSketchArtifact(TEMPLATE, root);
    assert.ok(artifact);
    assert.deepEqual(artifact.png, PNG);
  });

  it("rejects missing provenance", async () => {
    const cache = await seed();
    await rm(cache.metadataAbsolutePath);
    assert.equal(await resolveCurrentPlanSketchArtifact(TEMPLATE, root), null);
  });

  it("rejects a proof baked from obsolete SVG source", async () => {
    await seed("<svg>obsolete room topology</svg>");
    assert.equal(await resolveCurrentPlanSketchArtifact(TEMPLATE, root), null);
  });

  it("rejects damaged PNG chunks even with matching sidecar hashes", async () => {
    const damaged = Buffer.from(PNG);
    damaged[damaged.length - 1] ^= 1;
    await seed(renderTopologyProofSvg(getPlanGeometry(TEMPLATE)), damaged);
    assert.equal(await resolveCurrentPlanSketchArtifact(TEMPLATE, root), null);
  });

  it("rejects an outdated PNG hash and sidecars for another template", async () => {
    const cache = await seed();
    const metadata = buildPlanSketchCacheMetadata(TEMPLATE, renderTopologyProofSvg(getPlanGeometry(TEMPLATE)), PNG);
    await writeFile(cache.metadataAbsolutePath, JSON.stringify({ ...metadata, pngHash: "old-png-hash" }));
    assert.equal(await resolveCurrentPlanSketchArtifact(TEMPLATE, root), null);
    await writeFile(cache.metadataAbsolutePath, JSON.stringify({ ...metadata, templateId: "resale-exec-1990s" }));
    assert.equal(await resolveCurrentPlanSketchArtifact(TEMPLATE, root), null);
  });
});
