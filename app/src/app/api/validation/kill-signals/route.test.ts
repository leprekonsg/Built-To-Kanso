import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GET, POST } from "./route";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/validation/kill-signals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/validation/kill-signals", () => {
  it("exposes feed readiness and the three Phase 0.5 rules", async () => {
    const response = await GET();
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ready, true);
    assert.deepEqual(body.acceptedSources, ["user_study", "production_feedback", "demo_observation"]);
    assert.equal(body.rules.length, 3);
    assert.deepEqual(
      body.rules.map((rule: { id: string }) => rule.id).sort(),
      [
        "cultural_fortune_telling_drift",
        "damp_health_diagnosis_drift",
        "visual_overpowering_trust_layer",
      ],
    );
  });

  it("evaluates a user-study feedback batch and returns mandatory next actions", async () => {
    const response = await POST(jsonRequest({
      source: "user_study",
      studyId: "phase-0.5-smoke",
      feedback: [
        { userId: "u1", text: "I mostly remember the render." },
        { userId: "u2", text: "I did not notice the Black-state rule." },
        { userId: "u3", text: "I do not remember bathroom downwind protection." },
        { userId: "u4", text: "The Damp band was paired with an action." },
        { userId: "u5", text: "The prototype label was clear." },
        { userId: "u6", text: "The Shaft Buffer rule was clear." },
        { userId: "u7", text: "The plan stayed locked." },
        { userId: "u8", text: "The floor tier copy was clear." },
        { userId: "u9", text: "The evidence label was clear." },
        { userId: "u10", text: "The push-disabled note was clear." },
      ],
    }));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.feedbackCount, 10);
    assert.equal(body.trippedCount, 1);
    assert.equal(body.nextActions[0].id, "visual_overpowering_trust_layer");
    assert.match(body.nextActions[0].action, /Reduce visual density/);
  });

  it("returns actionable validation errors for malformed feedback", async () => {
    const response = await POST(jsonRequest({ feedback: [{ userId: "u1", text: "" }] }));
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error, "feedback[0].text is required.");
  });
});
