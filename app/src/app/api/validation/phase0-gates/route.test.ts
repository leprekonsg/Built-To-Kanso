import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GET, POST } from "./route";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/validation/phase0-gates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/validation/phase0-gates", () => {
  it("lists the auditable Phase 0 gates", async () => {
    const response = await GET();
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ready, true);
    assert.equal(body.gateIds.length, 8);
    assert.equal(body.totalGateCount, 9);
    assert.ok(body.gateIds.includes("webgpu_redmi_benchmark"));
    assert.equal(body.requirements.length, 8);
    assert.deepEqual(
      body.requirements.find((item: { gateId: string }) => item.gateId === "webgpu_redmi_benchmark").example.device,
      "Redmi Note 13",
    );
    assert.equal(body.automatedGates.length, 1);
    assert.equal(body.automatedGates[0].id, "template_architecture_verification");
    assert.equal(body.automatedGates[0].status, "complete");
    assert.deepEqual(body.automatedGates[0].issues, []);
  });

  it("evaluates tester evidence without inventing missing results", async () => {
    const response = await POST(jsonRequest({
      gateId: "live_studio_comprehension",
      evidence: {
        testerOutcomes: Array.from({ length: 10 }, (_, index) => ({
          testerId: `t${index}`,
          identifiedWindMoving: true,
          identifiedWithinSeconds: index < 8 ? 5 : 6,
        })),
      },
    }));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.passed, true);
    assert.equal(body.observed, "8/10");
  });

  it("rejects unknown gates with an actionable list", async () => {
    const response = await POST(jsonRequest({ gateId: "not_real", evidence: {} }));
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.error, /gateId must be one of/);
  });
});
