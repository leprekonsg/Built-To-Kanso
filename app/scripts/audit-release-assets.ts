import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildPhase1ReadinessReport } from "../src/server/validation/phase1Readiness";
import { getGeometryReleaseGate, isTemplateId } from "../src/server/geometry/registry";
import { releaseManifestEntry } from "../src/server/geometry/releaseManifest";

async function main() {
  const readiness = await buildPhase1ReadinessReport({} as NodeJS.ProcessEnv);
  const inventory = [];
  for (const directory of ["plan-sketches", "life-anchors", "life-sketches", "wind-base", "resonance-hour"]) {
    const root = join("public", directory);
    const templates = await readdir(root, { withFileTypes: true }).catch(() => []);
    for (const entry of templates) {
      if (!entry.isDirectory() || !isTemplateId(entry.name)) continue;
      const gate = getGeometryReleaseGate(entry.name);
      for (const file of await readdir(join(root, entry.name), { withFileTypes: true })) {
        if (!file.isFile()) continue;
        const path = `${directory}/${entry.name}/${file.name}`;
        const bytes = await readFile(join("public", path));
        const validation = readiness.renderAssets.assets.find((asset) => asset.relativePath === path || asset.metadataRelativePath === path);
        inventory.push({ path: `public/${path}`, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"),
          sourceReviewed: gate.eligible, selectedOutputs: releaseManifestEntry(entry.name)?.outputs ?? [],
          validation: validation ? { ok: validation.ok, issues: validation.issues } : { ok: false, issues: ["No registered artifact validation covers this file; it is not release evidence."] },
          visualReviewThisRun: false });
      }
    }
  }
  const report = {
    schemaVersion: 1, auditedAt: new Date().toISOString(),
    releaseReady: readiness.complete, releaseManifest: readiness.releaseManifest, blockers: readiness.blockers,
    assets: inventory,
    limits: ["This audit verifies local metadata and release status, not architectural authenticity or visual correctness.",
      "Next.js gates direct template cache URLs. Previously downloaded copies and static-host deployments are outside this local audit."],
  };
  await mkdir("output/release-validation", { recursive: true });
  await writeFile("output/release-validation/asset-audit.json", `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ releaseReady: report.releaseReady, assetCount: inventory.length,
    report: "output/release-validation/asset-audit.json", blockers: report.blockers }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
