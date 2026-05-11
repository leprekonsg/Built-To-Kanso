import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { reviewLifeSketchCandidates } from "./lifeSketchReview";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function png(id: number): Buffer {
  return Buffer.concat([PNG_MAGIC, Buffer.from([id])]);
}

function acceptedReviewPayload(): Record<string, unknown> {
  return {
    acceptedCandidateIndex: 1,
    summary: "candidate_1_preserves_locked_topology",
    candidateReviews: [
      {
        candidateIndex: 0,
        status: "rejected",
        reasons: ["camera_view_drift"],
        checks: {
          roomTopology: "pass",
          windowBalconyDirection: "pass",
          kitchenHsPipeshaft: "pass",
          majorWallMasses: "pass",
          cameraView: "fail",
        },
      },
      {
        candidateIndex: 1,
        status: "accepted",
        reasons: [],
        checks: {
          roomTopology: "pass",
          windowBalconyDirection: "pass",
          kitchenHsPipeshaft: "pass",
          majorWallMasses: "pass",
          cameraView: "pass",
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
    });

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "missing_topology_proof");
  });

  it("rejects one-candidate batches before caching can happen", async () => {
    const result = await reviewLifeSketchCandidates({
      anchorPng: png(0),
      topologyProof: png(9),
      candidates: [png(1)],
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
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.acceptedCandidateIndex, 1);
    assert.equal(result.candidateReviews[0]?.reasons[0], "camera_view_drift");
    assert.equal(body?.model, "gpt-4.1-mini");
    const input = body?.input as Array<{ content: Array<{ type: string }> }> | undefined;
    const imageInputs = input?.[0]?.content.filter((item) => item.type === "input_image") ?? [];
    assert.equal(imageInputs.length, 4);
  });
});
