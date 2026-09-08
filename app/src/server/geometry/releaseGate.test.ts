import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getGeometryReleaseGate, getPlanGeometry } from "./registry";
import { evaluateGeometryReleaseGate, geometrySha256, sourceManifestSha256 } from "./provenance";
import { coherentShaftlessPlan, verifiedTestEvidence } from "./testFixtures";
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
    const plan = coherentShaftlessPlan();
    const [manifest, review] = verifiedTestEvidence(plan);
    const gate = evaluateGeometryReleaseGate(plan, manifest, review);
    assert.equal(gate.eligible, true);
    assert.equal(gate.capabilities.layoutDisplay.available, true);
    assert.equal(gate.capabilities.shaftAdvice.available, false);
    assert.equal(gate.capabilities.homeWeatherAlignment.available, false);

    plan.openings[1].end = { x: 5, y: 2 };
    assert.match(validatePlanTopology(plan).issues.join("\n"), /living-bath.*declared room/);
  });

  it("rejects inconsistent present pipeshaft and bathroom semantics", () => {
    const plan = coherentShaftlessPlan();
    plan.pipeshaft = {
      id: "shaft", roomId: "living", openingPoint: { x: 1, y: 1 }, openingDirectionDeg: 0,
      jetVelocityMps: [0.1, 0.2], bufferRadiusM: 0.6, downwindRoomIds: ["missing"],
    };
    plan.bathrooms[0].roomId = "living";
    const issues = validatePlanGeometry(plan).issues.join("\n");
    assert.match(issues, /room must be a service, kitchen, or bathroom/);
    assert.match(issues, /exactly one physical opening/);
    assert.match(issues, /downwind rooms must be unique known rooms/);
    assert.match(issues, /must reference a room with kind "bathroom"/);
  });

  it("accepts a consistent present shaft while keeping advice behind release selection", () => {
    const plan = coherentShaftlessPlan();
    plan.pipeshaft = {
      id: "bath-shaft", roomId: "bath", openingPoint: { x: 5, y: 1 }, openingDirectionDeg: 90,
      jetVelocityMps: [0.1, 0.2], bufferRadiusM: 0.6, downwindRoomIds: ["living"],
    };
    plan.fixedElements.push({ id: "bath-shaft-opening", kind: "pipeshaft_opening", confidence: "black", x: 4.8, y: 0.8, width: 0.4, height: 0.4, bufferEligible: true });
    const [manifest, review] = verifiedTestEvidence(plan);
    const gate = evaluateGeometryReleaseGate(plan, manifest, review);
    assert.equal(gate.eligible, true);
    assert.equal(gate.basicValidation.ok, true);
    assert.equal(gate.capabilities.shaftAdvice.available, false);
    assert.match(gate.capabilities.shaftAdvice.reason ?? "", /release selection/);

    plan.fixedElements.push({ id: "orphan-shaft", kind: "pipeshaft_opening", confidence: "black", x: 4.2, y: 0.2, width: 0.2, height: 0.2 });
    assert.match(validatePlanGeometry(plan).issues.join("\n"), /exactly one physical opening/);
    plan.fixedElements.pop();
    plan.pipeshaft.jetVelocityMps = [0.1] as unknown as [number, number];
    assert.match(validatePlanGeometry(plan).issues.join("\n"), /values must be finite/);
  });

  it("suppresses home-specific alignment when orientation is unknown", () => {
    const plan = coherentShaftlessPlan();
    const [manifest, review] = verifiedTestEvidence(plan);
    manifest.coordinateTransform.planToNorthDeg = null;
    review.sourceManifestSha256 = sourceManifestSha256(manifest);
    const gate = evaluateGeometryReleaseGate(plan, manifest, review);
    assert.equal(gate.eligible, true);
    assert.equal(gate.capabilities.orientationAnalysis.available, false);
    assert.equal(gate.capabilities.homeWeatherAlignment.available, false);
  });

  it("never releases diagnostic scope even if review fields are complete", () => {
    const plan = getPlanGeometry("tampines-greenweave");
    const [manifest, review] = verifiedEvidence(plan);
    manifest.intendedScope = "diagnostic";
    review.sourceManifestSha256 = sourceManifestSha256(manifest);
    assert.match(evaluateGeometryReleaseGate(plan, manifest, review).provenance.issues.join("\n"), /Diagnostic geometry/);
  });
});
