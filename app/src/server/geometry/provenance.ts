import { createHash } from "node:crypto";
import type {
  GeometryReleaseGateResult,
  GeometryReviewRecord,
  GeometrySourceManifest,
  PlanGeometry,
} from "./types";
import { validatePlanTopology } from "./topology";
import { validatePlanGeometry } from "./validation";

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
}

export function geometrySha256(plan: PlanGeometry): string {
  return createHash("sha256").update(canonicalJson(plan), "utf8").digest("hex");
}

export function sourceManifestSha256(manifest: GeometrySourceManifest): string {
  return createHash("sha256").update(canonicalJson(manifest), "utf8").digest("hex");
}

export function evaluateGeometryReleaseGate(
  plan: PlanGeometry,
  manifest: GeometrySourceManifest,
  review: GeometryReviewRecord,
): GeometryReleaseGateResult {
  const basicValidation = validatePlanGeometry(plan);
  const topology = validatePlanTopology(plan);
  const hash = geometrySha256(plan);
  const issues: string[] = [];

  if (manifest.templateId !== plan.templateId || review.templateId !== plan.templateId) {
    issues.push("Source manifest and review must identify the same template as the geometry.");
  }
  if (manifest.geometrySha256 !== hash) issues.push("Source manifest is stale for the current geometry hash.");
  if (review.geometrySha256 !== hash) issues.push("Geometry review is stale for the current geometry hash.");
  if (manifest.schemaVersion !== 1 || review.schemaVersion !== 1) issues.push("Unsupported provenance schema version.");
  if (!manifest.sourceDocument.sha256 || !/^[a-f0-9]{64}$/i.test(manifest.sourceDocument.sha256)) issues.push("Source document checksum must be a 64-character SHA-256 digest.");
  if (!manifest.sourceDocument.drawingPage || !manifest.sourceDocument.revision || !manifest.sourceDocument.variant) {
    issues.push("Source drawing page, revision (or explicit unknown), and applicable variant are required for release.");
  }
  if (!manifest.coordinateTransform.origin || !manifest.coordinateTransform.axes) issues.push("Coordinate origin and axes are required for release.");
  if (manifest.uncertaintyM === null || !Number.isFinite(manifest.uncertaintyM) || manifest.uncertaintyM < 0) {
    issues.push("Coordinate uncertainty must be documented as a non-negative finite value.");
  }
  if (!review.reviewer || !review.reviewedAt || !Number.isFinite(Date.parse(review.reviewedAt))) issues.push("A reviewer and valid ISO review date are required for release.");
  if (review.sourceManifestSha256 !== sourceManifestSha256(manifest)) issues.push("Geometry review is stale for the current source manifest.");
  if (review.statuses.sourceAuthenticity !== "verified") issues.push("sourceAuthenticity must be verified for release.");
  if (review.statuses.geometricAccuracy !== "verified") issues.push("geometricAccuracy must be verified for release.");
  if (manifest.intendedScope === "diagnostic") issues.push("Diagnostic geometry cannot be released for resident-ready use.");
  if (!["diagnostic", "generic_template", "resident_specific"].includes(manifest.intendedScope)) issues.push("Source review scope is not supported.");
  if (manifest.intendedScope === "resident_specific" && review.statuses.asBuiltConfirmation !== "verified") issues.push("asBuiltConfirmation must be verified for resident-specific release.");

  const shaftElement = plan.fixedElements.find(
    (element) => element.kind === "pipeshaft_opening" && element.bufferEligible,
  );
  const pipeshaft = plan.pipeshaft;
  const shaftAdviceAvailable = Boolean(shaftElement && pipeshaft && plan.rooms.some((room) => room.id === pipeshaft.roomId));
  const provenance = { ok: issues.length === 0, issues, geometrySha256: hash, statuses: review.statuses };

  return {
    eligible: basicValidation.ok && topology.ok && provenance.ok,
    basicValidation,
    topology,
    provenance,
    capabilities: {
      shaftAdvice: {
        available: shaftAdviceAvailable,
        reason: shaftAdviceAvailable ? null : "Pipeshaft location or buffer evidence is unavailable; shaft-related advice is disabled.",
      },
      orientationAnalysis: {
        available: manifest.coordinateTransform.planToNorthDeg !== null && Number.isFinite(manifest.coordinateTransform.planToNorthDeg),
        reason: manifest.coordinateTransform.planToNorthDeg !== null && Number.isFinite(manifest.coordinateTransform.planToNorthDeg) ? null : "Plan-to-north rotation is unknown; orientation analysis is disabled.",
      },
    },
  };
}
