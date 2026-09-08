import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { reviewLifeSketchCandidates } from "./lifeSketchReview";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==",
  "base64",
);
const CHECKS = [
  "roomTopology", "windowBalconyDirection", "kitchenHsPipeshaft", "majorWallMasses",
  "cameraView", "bathroomCount", "serviceYard", "householdShelterInterior",
] as const;

function candidate(candidateIndex: number): Record<string, unknown> {
  return {
    candidateIndex,
    status: candidateIndex === 0 ? "accepted" : "rejected",
    reasons: [],
    observedBathroomCount: 2,
    checks: Object.fromEntries(CHECKS.map((check) => [check, "pass"])),
  };
}

function reviewPayload(): Record<string, unknown> {
  return { acceptedCandidateIndex: 0, summary: "Structure preserved", candidateReviews: [candidate(0), candidate(1)] };
}

describe("Life Sketch review validates the complete response", () => {
  let originalFetch: typeof fetch;
  let originalKey: string | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test-review-validation";
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  });

  async function review(payload: unknown) {
    globalThis.fetch = (async () => new Response(JSON.stringify({ output_text: JSON.stringify(payload) }), { status: 200 })) as typeof fetch;
    return reviewLifeSketchCandidates({ anchorPng: PNG, topologyProof: PNG, candidates: [PNG, PNG], lockedBathroomCount: 2 });
  }

  it("accepts a complete, consistent passing review", async () => {
    assert.equal((await review(reviewPayload())).ok, true);
  });

  for (const check of CHECKS) {
    for (const verdict of ["fail", "uncertain"]) {
      it(`rejects accepted status when ${check} is ${verdict}`, async () => {
        const payload = reviewPayload();
        const reviews = payload.candidateReviews as Array<Record<string, unknown>>;
        (reviews[0].checks as Record<string, unknown>)[check] = verdict;
        assert.equal((await review(payload)).ok, false);
      });
    }
  }

  const malformedCases: Array<[string, () => unknown]> = [
    ["null review", () => null],
    ["missing reviews", () => ({ acceptedCandidateIndex: 0, summary: "Incomplete" })],
    ["object reviews", () => ({ ...reviewPayload(), candidateReviews: {} })],
    ["null review item", () => ({ ...reviewPayload(), candidateReviews: [null, candidate(1)] })],
    ["missing checks", () => ({ ...reviewPayload(), candidateReviews: [{ ...candidate(0), checks: undefined }, candidate(1)] })],
    ["missing check", () => {
      const first = candidate(0);
      delete (first.checks as Record<string, unknown>).cameraView;
      return { ...reviewPayload(), candidateReviews: [first, candidate(1)] };
    }],
    ["missing candidate index", () => ({ ...reviewPayload(), candidateReviews: [candidate(0)] })],
    ["duplicate candidate index", () => ({ ...reviewPayload(), candidateReviews: [candidate(0), candidate(0)] })],
    ["out-of-range candidate index", () => ({ ...reviewPayload(), candidateReviews: [candidate(0), candidate(2)] })],
    ["fractional accepted index", () => ({ ...reviewPayload(), acceptedCandidateIndex: 0.5 })],
    ["non-array reasons", () => ({ ...reviewPayload(), candidateReviews: [{ ...candidate(0), reasons: "oops" }, candidate(1)] })],
    ["non-string reason", () => ({ ...reviewPayload(), candidateReviews: [{ ...candidate(0), reasons: [null] }, candidate(1)] })],
    ["non-string summary", () => ({ ...reviewPayload(), summary: { text: "ok" } })],
    ["fractional observed count", () => ({ ...reviewPayload(), candidateReviews: [{ ...candidate(0), observedBathroomCount: 2.5 }, candidate(1)] })],
  ];

  for (const [name, payload] of malformedCases) {
    it(`rejects ${name} without throwing`, async () => {
      assert.equal((await review(payload())).ok, false);
    });
  }

  for (const [name, payload] of [
    ["null envelope", null],
    ["non-array output", { output: {} }],
    ["null output item", { output: [null] }],
    ["non-array content", { output: [{ content: {} }] }],
    ["non-string output text", { output: [{ content: [{ text: 12 }] }] }],
  ] as const) {
    it(`rejects ${name} without throwing`, async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify(payload), { status: 200 })) as typeof fetch;
      const result = await reviewLifeSketchCandidates({ anchorPng: PNG, topologyProof: PNG, candidates: [PNG, PNG], lockedBathroomCount: 2 });
      assert.equal(result.ok, false);
    });
  }
});
