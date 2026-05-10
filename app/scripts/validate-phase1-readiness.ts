import { loadEnvConfig } from "@next/env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildPhase1ReadinessReport, type Phase0EvidenceBundle } from "../src/server/validation/phase1Readiness";
import type { OperationalEvidence } from "../src/server/validation/operationalPreflight";

interface EvidenceFile {
  phase0Evidence?: Phase0EvidenceBundle;
  operationalEvidence?: OperationalEvidence;
}

function usage(): never {
  console.error("Usage: npm run validate:phase1 -- ../phase1-readiness-evidence.template.json");
  process.exit(2);
}

function readEvidenceFile(filePath: string): EvidenceFile {
  const fullPath = resolve(process.cwd(), filePath);
  try {
    const parsed = JSON.parse(readFileSync(fullPath, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Root value must be an object.");
    }
    return parsed as EvidenceFile;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Could not read Phase 1 evidence JSON at ${fullPath}: ${message}`);
    process.exit(2);
  }
}

async function main() {
  const [filePath] = process.argv.slice(2);
  if (!filePath) usage();

  loadEnvConfig(process.cwd());
  const evidence = readEvidenceFile(filePath);
  const report = await buildPhase1ReadinessReport(
    process.env,
    evidence.phase0Evidence ?? {},
    evidence.operationalEvidence ?? {},
  );

  const summary = {
    complete: report.complete,
    demoReady: report.demoReady,
    repoImplementationComplete: report.repoImplementationComplete,
    implementation: `${report.implementation.complete}/${report.implementation.total}`,
    phase0: `${report.phase0.complete}/${report.phase0.total}`,
    operationalComplete: report.operational.complete,
    blockers: report.blockers,
    demoBlockers: report.demoBlockers,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!report.complete) {
    console.error("Phase 1 readiness is incomplete. Fill the evidence JSON with real passing evidence and rerun.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
