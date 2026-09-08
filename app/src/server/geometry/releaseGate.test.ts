import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getGeometryReleaseGate, getPlanGeometry } from "./registry";
import { evaluateGeometryReleaseGate, geometrySha256, sourceManifestSha256 } from "./provenance";
import { validatePlanTopology } from "./topology";
import type { GeometryReviewRecord, GeometrySourceManifest, PlanGeometry } from "./types";
import { validatePlanGeometry } from "./validation";

function verifiedEvidence(plan: PlanGeometry): [GeometrySourceManifest, GeometryReviewRecord] {
  const hash = geometrySha256(plan);
  const manifest: GeometrySourceManifest = {
      schemaVersion: 1,
      templateId: plan.templateId,
      geometrySha256: hash,
      sourceDocument: { title: "Test drawing", uri: null, sha256: "a".repeat(64), drawingPage: "1", revision: "A", variant: "test" },
      coordinateTransform: { origin: "bottom-left", axes: "+x east, +y north", planToNorthDeg: 0 },
      uncertaintyM: 0.01,
      intendedScope: "generic_template",
    };
  return [
    manifest,
    {
      schemaVersion: 1,
      templateId: plan.templateId,
      geometrySha256: hash,
      sourceManifestSha256: sourceManifestSha256(manifest),
      reviewer: "Test reviewer",
      reviewedAt: "2026-09-08T00:00:00.000Z",
      statuses: { sourceAuthenticity: "verified", geometricAccuracy: "verified", asBuiltConfirmation: "not_applicable", renovationApproval: "not_applicable" },
      notes: [],
    },
  ];
}

describe("geometry release containment", () => {
  it("loads known-invalid Tampines geometry for diagnostics but blocks release", () => {
    const plan = getPlanGeometry("tampines-greenweave");
    assert.equal(validatePlanGeometry(plan).ok, true);
    const gate = getGeometryReleaseGate("tampines-greenweave");
    assert.equal(gate.eligible, false);
    assert.match(gate.topology.issues.join("\n"), /entry.*household_shelter.*1\.3200 m²/);
    assert.match(gate.topology.issues.join("\n"), /household_shelter_door.*entry/);
  });

  it("rejects non-finite geometry and improper room overlap but ignores fixed restriction overlays", () => {
    const plan = structuredClone(getPlanGeometry("tampines-greenweave"));
    plan.rooms = [
      { id: "a", label: "A", kind: "living", confidence: "green", x: 0, y: 0, width: 2, height: 2 },
      { id: "b", label: "B", kind: "bedroom", confidence: "green", x: 1, y: 1, width: 2, height: 2 },
    ];
    plan.openings = [];
    plan.fixedElements = [{ id: "overlay", kind: "structural_wall", confidence: "black", x: 0, y: 0, width: 2, height: 2 }];
    assert.deepEqual(validatePlanTopology(plan).issues, ['Rooms "a" and "b" overlap by 1.0000 m².']);
    plan.rooms[0].x = Number.NaN;
    assert.match(validatePlanGeometry(plan).issues.join("\n"), /Room "a" must have positive dimensions/);
  });

  it("invalidates review evidence when geometry changes", () => {
    const plan = structuredClone(getPlanGeometry("tampines-greenweave"));
    const [manifest, review] = verifiedEvidence(plan);
    plan.openingAreaPct += 1;
    const gate = evaluateGeometryReleaseGate(plan, manifest, review);
    assert.equal(gate.provenance.ok, false);
    assert.match(gate.provenance.issues.join("\n"), /manifest is stale/);
    assert.match(gate.provenance.issues.join("\n"), /review is stale/);
  });

  it("reports unavailable shaft advice as a capability instead of invalid geometry", () => {
    const plan = structuredClone(getPlanGeometry("tampines-greenweave"));
    plan.fixedElements = plan.fixedElements.filter((element) => element.kind !== "pipeshaft_opening");
    Reflect.deleteProperty(plan, "pipeshaft");
    const [manifest, review] = verifiedEvidence(plan);
    const gate = evaluateGeometryReleaseGate(plan, manifest, review);
    assert.equal(gate.basicValidation.ok, true);
    assert.equal(gate.capabilities.shaftAdvice.available, false);
  });

  it("passes a coherent generic template without implying as-built or renovation approval", () => {
    const plan = structuredClone(getPlanGeometry("tampines-greenweave"));
    plan.bounds = { x: 0, y: 0, width: 4, height: 2 };
    plan.rooms = [
      { id: "a", label: "A", kind: "living", confidence: "green", x: 0, y: 0, width: 2, height: 2 },
      { id: "b", label: "B", kind: "bedroom", confidence: "green", x: 2, y: 0, width: 2, height: 2 },
    ];
    plan.openings = [{ id: "shared", kind: "door", roomIds: ["a", "b"], start: { x: 2, y: 0.5 }, end: { x: 2, y: 1.5 }, operable: true }];
    plan.fixedElements = [];
    plan.bathrooms = [{ roomId: "a", exhaustPoint: { x: 1, y: 1 } }];
    const [manifest, review] = verifiedEvidence(plan);
    assert.equal(evaluateGeometryReleaseGate(plan, manifest, review).eligible, true);

    plan.openings[0].end = { x: 3, y: 2 };
    assert.match(validatePlanTopology(plan).issues.join("\n"), /shared.*declared room/);
  });

  it("never releases diagnostic scope even if review fields are complete", () => {
    const plan = getPlanGeometry("tampines-greenweave");
    const [manifest, review] = verifiedEvidence(plan);
    manifest.intendedScope = "diagnostic";
    review.sourceManifestSha256 = sourceManifestSha256(manifest);
    assert.match(evaluateGeometryReleaseGate(plan, manifest, review).provenance.issues.join("\n"), /Diagnostic geometry/);
  });
});
