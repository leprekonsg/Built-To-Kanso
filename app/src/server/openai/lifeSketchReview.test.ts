import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { reviewLifeSketchCandidates } from "./lifeSketchReview";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function png(id: number): Buffer {
  return Buffer.concat([PNG_MAGIC, Buffer.from([id])]);
}

function acceptedReviewPayload(
  overrides: { acceptedObserved?: number; acceptedServiceYard?: "pass" | "fail" | "uncertain" } = {},
): Record<string, unknown> {
  const acceptedObserved = overrides.acceptedObserved ?? 2;
  const acceptedServiceYard = overrides.acceptedServiceYard ?? "pass";
  return {
    acceptedCandidateIndex: 1,
    summary: "candidate_1_preserves_locked_topology",
    candidateReviews: [
      {
        candidateIndex: 0,
        status: "rejected",
        reasons: ["camera_view_drift"],
        observedBathroomCount: 2,
        checks: {
          roomTopology: "pass",
          windowBalconyDirection: "pass",
          kitchenHsPipeshaft: "pass",
          majorWallMasses: "pass",
          cameraView: "fail",
          bathroomCount: "pass",
          serviceYard: "pass",
        },
      },
      {
        candidateIndex: 1,
        status: "accepted",
        reasons: [],
        observedBathroomCount: acceptedObserved,
        checks: {
          roomTopology: "pass",
          windowBalconyDirection: "pass",
          kitchenHsPipeshaft: "pass",
          majorWallMasses: "pass",
          cameraView: "pass",
          bathroomCount: acceptedObserved === 2 ? "pass" : "fail",
          serviceYard: acceptedServiceYard,
        },
      },
    ],
  };
}

describe("Life Sketch candidate review", () => {
  let originalFetch: typeof globalThis.fetch;
  let originalKey: string | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test-review";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  });

  it("rejects review without topology proof", async () => {
    const result = await reviewLifeSketchCandidates({
      anchorPng: png(0),
      candidates: [png(1), png(2)],
      lockedBathroomCount: 2,
    });

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "missing_topology_proof");
  });

  it("rejects review without lockedBathroomCount", async () => {
    const result = await reviewLifeSketchCandidates({
      anchorPng: png(0),
      topologyProof: png(9),
      candidates: [png(1), png(2)],
    });

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "missing_locked_bathroom_count");
  });

  it("rejects one-candidate batches before caching can happen", async () => {
    const result = await reviewLifeSketchCandidates({
      anchorPng: png(0),
      topologyProof: png(9),
      candidates: [png(1)],
      lockedBathroomCount: 2,
    });

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "candidate_batch_too_small");
  });

  it("selects the accepted candidate from Responses JSON", async () => {
    let body: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_url, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({ output_text: JSON.stringify(acceptedReviewPayload()) }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const result = await reviewLifeSketchCandidates({
      anchorPng: png(0),
      topologyProof: png(9),
      candidates: [png(1), png(2)],
      manifestSummary: "template=tengah-5room; rooms=living,bedroom",
      lockedBathroomCount: 2,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.acceptedCandidateIndex, 1);
    assert.equal(result.candidateReviews[0]?.reasons[0], "camera_view_drift");
    assert.equal(body?.model, "gpt-4.1-mini");
    const input = body?.input as Array<{ content: Array<{ type: string }> }> | undefined;
    const imageInputs = input?.[0]?.content.filter((item) => item.type === "input_image") ?? [];
    assert.equal(imageInputs.length, 4);
    const promptInputs = (input?.[0]?.content.filter(
      (item) => item.type === "input_text",
    ) ?? []) as Array<{ type: string; text: string }>;
    assert.ok(
      promptInputs.some((item) => item.text.includes("Locked bathroom count: 2")),
      "review prompt should surface the locked bathroom count to the reviewer",
    );
  });

  it("surfaces service-yard discipline in the reviewer prompt", async () => {
    let body: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_url, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({ output_text: JSON.stringify(acceptedReviewPayload()) }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const result = await reviewLifeSketchCandidates({
      anchorPng: png(0),
      topologyProof: png(9),
      candidates: [png(1), png(2)],
      manifestSummary: "template=tampines-greenweave; bathroomCount=2",
      lockedBathroomCount: 2,
    });

    assert.equal(result.ok, true);
    const promptInputs = ((body?.input as Array<{ content: Array<{ type: string; text?: string }> }>)[0]
      .content.filter((item) => item.type === "input_text") ?? []) as Array<{ text: string }>;
    const promptText = promptInputs.map((item) => item.text).join("\n");
    assert.match(promptText, /Service-yard discipline/);
    assert.match(promptText, /washing machine or stacked washer\/dryer/);
    assert.match(promptText, /visible floor drain/);
    assert.match(promptText, /exterior louvre/);
    assert.match(promptText, /never a sealed closet/);
    assert.match(promptText, /service_yard_blank/);
  });

  it("overrides accept and reports service_yard_check_failed when the accepted candidate's serviceYard check is fail", async () => {
    // VLM sometimes returns "accepted" with a failing nested check — the schema
    // permits it. The deterministic override must catch it so the prebake
    // re-runs rather than caching a yard rendered as a closet or bathroom.
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          output_text: JSON.stringify(acceptedReviewPayload({ acceptedServiceYard: "fail" })),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;

    const result = await reviewLifeSketchCandidates({
      anchorPng: png(0),
      topologyProof: png(9),
      candidates: [png(1), png(2)],
      manifestSummary: "template=tampines-greenweave; bathroomCount=2",
      lockedBathroomCount: 2,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "service_yard_check_failed");
    const accepted = result.candidateReviews?.find((item) => item.candidateIndex === 1);
    assert.ok(accepted);
    assert.equal(accepted?.status, "rejected");
    assert.equal(accepted?.checks.serviceYard, "fail");
    assert.ok(accepted?.reasons.includes("service_yard_check_failed"));
  });

  it("overrides accept when the accepted candidate's serviceYard check is uncertain", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          output_text: JSON.stringify(acceptedReviewPayload({ acceptedServiceYard: "uncertain" })),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;

    const result = await reviewLifeSketchCandidates({
      anchorPng: png(0),
      topologyProof: png(9),
      candidates: [png(1), png(2)],
      manifestSummary: "template=tampines-greenweave; bathroomCount=2",
      lockedBathroomCount: 2,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "service_yard_check_failed");
    const accepted = result.candidateReviews?.find((item) => item.candidateIndex === 1);
    assert.ok(accepted);
    assert.equal(accepted?.checks.serviceYard, "uncertain");
    assert.ok(accepted?.reasons.includes("service_yard_check_failed"));
  });

  it("overrides accept and reports bathroom_count_drift when reviewer's observed count disagrees with the locked plan", async () => {
    // The reviewer says the candidate passes every visual check and accepts it,
    // but the typed-integer observation reveals a hallucinated 3rd bathroom.
    // The deterministic gate must fire and reject regardless of the verdict.
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          output_text: JSON.stringify(acceptedReviewPayload({ acceptedObserved: 3 })),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;

    const result = await reviewLifeSketchCandidates({
      anchorPng: png(0),
      topologyProof: png(9),
      candidates: [png(1), png(2)],
      manifestSummary: "template=tampines-greenweave; bathroomCount=2",
      lockedBathroomCount: 2,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "bathroom_count_drift");
    const accepted = result.candidateReviews?.find((item) => item.candidateIndex === 1);
    assert.ok(accepted);
    assert.equal(accepted?.status, "rejected");
    assert.equal(accepted?.checks.bathroomCount, "fail");
    assert.ok(accepted?.reasons.includes("bathroom_count_drift"));
  });
});
