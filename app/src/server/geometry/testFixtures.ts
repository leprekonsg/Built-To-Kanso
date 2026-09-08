import { geometrySha256, sourceManifestSha256 } from "./provenance";
import type { GeometryReviewRecord, GeometrySourceManifest, PlanGeometry } from "./types";

/** Coherent software fixture only. It is not source evidence and must never enter the production registry. */
export function coherentShaftlessPlan(): PlanGeometry {
  return {
    schemaVersion: 1,
    templateId: "tampines-greenweave",
    units: "meters",
    source: "architect_curated_template",
    bounds: { x: 0, y: 0, width: 6, height: 3 },
    openingAreaPct: 12,
    westSunFacadeDeg: 270,
    defaultDoorFacingDeg: 0,
    rooms: [
      { id: "living", label: "Living", kind: "living", confidence: "green", x: 0, y: 0, width: 4, height: 3 },
      { id: "bath", label: "Bathroom", kind: "bathroom", confidence: "black", x: 4, y: 0, width: 2, height: 3 },
    ],
    openings: [
      { id: "living-exterior", kind: "window", roomIds: ["living"], start: { x: 0, y: 1 }, end: { x: 0, y: 2 }, operable: true },
      { id: "living-bath", kind: "door", roomIds: ["living", "bath"], start: { x: 4, y: 1 }, end: { x: 4, y: 2 }, operable: true },
      { id: "bath-exterior", kind: "window", roomIds: ["bath"], start: { x: 6, y: 1 }, end: { x: 6, y: 2 }, operable: true },
    ],
    fixedElements: [{ id: "bath-wet-zone", kind: "wet_zone", confidence: "black", x: 4, y: 0, width: 2, height: 3 }],
    bathrooms: [{ roomId: "bath", exhaustPoint: { x: 5, y: 1.5 } }],
  };
}

export function verifiedTestEvidence(plan: PlanGeometry): [GeometrySourceManifest, GeometryReviewRecord] {
  const hash = geometrySha256(plan);
  const manifest: GeometrySourceManifest = {
    schemaVersion: 1,
    templateId: plan.templateId,
    geometrySha256: hash,
    sourceDocument: { title: "Synthetic test drawing", uri: null, sha256: "a".repeat(64), drawingPage: "1", revision: "test", variant: "software-fixture" },
    coordinateTransform: { origin: "bottom-left", axes: "+x east, +y north", planToNorthDeg: 0 },
    uncertaintyM: 0.01,
    intendedScope: "generic_template",
  };
  const review: GeometryReviewRecord = {
    schemaVersion: 1,
    templateId: plan.templateId,
    geometrySha256: hash,
    sourceManifestSha256: sourceManifestSha256(manifest),
    reviewer: "Synthetic test reviewer",
    reviewedAt: "2026-09-08T00:00:00.000Z",
    statuses: { sourceAuthenticity: "verified", geometricAccuracy: "verified", asBuiltConfirmation: "not_applicable", renovationApproval: "not_applicable" },
    notes: ["Software fixture only; not evidence for a real home."],
  };
  return [manifest, review];
}
