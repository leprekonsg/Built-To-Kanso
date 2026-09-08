import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateGeometryReleaseGate } from "./provenance";
import { geometryOutputResponse, submittedGeometryCapabilityResponse, submittedGeometryReleaseResponse } from "./releaseResponse";
import { coherentShaftlessPlan, verifiedTestEvidence } from "./testFixtures";

function dependencies() {
  const plan = coherentShaftlessPlan();
  const [manifest, review] = verifiedTestEvidence(plan);
  const gate = evaluateGeometryReleaseGate(plan, manifest, review);
  return { plan, gate, deps: { getPlan: () => plan, getGate: () => gate } };
}

describe("submitted geometry feature boundary", () => {
  it("accepts geometry endpoint metadata without weakening hash binding", () => {
    const { plan, gate, deps } = dependencies();
    assert.equal(submittedGeometryReleaseResponse({ ...plan, releaseGate: gate, diagnosticOnly: false }, deps), null);
    const changed = submittedGeometryReleaseResponse({ ...plan, unexpectedPhysics: true }, deps);
    assert.equal(changed?.status, 409);
  });

  it("allows only capabilities selected for this release", async () => {
    const { plan, deps } = dependencies();
    assert.equal(submittedGeometryCapabilityResponse(plan, "layoutDisplay", deps), null);
    const blocked = submittedGeometryCapabilityResponse(plan, "illustrativeAirflow", deps);
    assert.equal(blocked?.status, 422);
    assert.equal(blocked?.headers.get("cache-control"), "no-store");
    assert.equal((await blocked?.json()).error, "geometry_capability_not_ready");
  });

  it("allows a selected layout export but rejects unselected presentation images", async () => {
    const { plan, deps } = dependencies();
    assert.equal(geometryOutputResponse(plan.templateId, "plan_svg", deps), null);
    const blocked = geometryOutputResponse(plan.templateId, "life_sketch", deps);
    assert.equal(blocked?.status, 422);
    assert.equal((await blocked?.json()).error, "output_not_released");
  });
});
