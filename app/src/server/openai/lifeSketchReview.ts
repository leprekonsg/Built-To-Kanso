import { getOpenAIImageConfig, sanitizeOpenAIErrorDetail } from "./client";

const RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_REVIEW_MODEL = "gpt-4.1-mini";

// Bump when the QA gate's enforcement surface changes (new structural check,
// new schema field, new deterministic post-check). Threaded into the sketch
// cache key so previously-accepted candidates that pre-date the change are
// invalidated automatically — the prebake re-runs and re-reviews them.
//
//   v1 (initial): VLM checks only — roomTopology, windowBalconyDirection,
//                 kitchenHsPipeshaft, majorWallMasses, cameraView.
//   v2 (2026-05-11): deterministic bathroom-count gate added on top of the
//                    VLM verdict; reviewer must publish observedBathroomCount.
//   v3 (2026-05-16): service-yard affordance check added. Reviewer must
//                    confirm a visible washer/dryer + drain + exterior louvre
//                    or window in every locked service yard, and reject any
//                    candidate that renders the yard as a sealed closet,
//                    blank alcove, bathroom, or second bedroom.
export const LIFE_SKETCH_QA_GATE_VERSION = "v3-service-yard-affordance";

export type LifeSketchReviewCheck = "pass" | "fail" | "uncertain";

export interface LifeSketchCandidateReview {
  candidateIndex: number;
  status: "accepted" | "rejected";
  reasons: string[];
  // Plumbing fixtures the reviewer can see in the candidate. The locked plan
  // is the source of truth; we reject deterministically downstream when this
  // disagrees with `lockedBathroomCount`. Forcing a typed integer here is
  // what makes the QA gate actually catch a hallucinated 3rd bathroom — the
  // VLM cannot answer "all checks pass" without also publishing a count.
  observedBathroomCount: number;
  checks: {
    roomTopology: LifeSketchReviewCheck;
    windowBalconyDirection: LifeSketchReviewCheck;
    kitchenHsPipeshaft: LifeSketchReviewCheck;
    majorWallMasses: LifeSketchReviewCheck;
    cameraView: LifeSketchReviewCheck;
    bathroomCount: LifeSketchReviewCheck;
    serviceYard: LifeSketchReviewCheck;
  };
}

export type LifeSketchReviewResult =
  | {
      ok: true;
      model: string;
      acceptedCandidateIndex: number;
      candidateReviews: LifeSketchCandidateReview[];
      summary: string;
    }
  | {
      ok: false;
      reason:
        | "missing_topology_proof"
        | "missing_locked_bathroom_count"
        | "candidate_batch_too_small"
        | "all_candidates_rejected"
        | "bathroom_count_drift"
        | "service_yard_check_failed"
        | "openai_error"
        | "openai_unreachable"
        | "openai_timeout";
      detail: string;
      model?: string;
      candidateReviews?: LifeSketchCandidateReview[];
      summary?: string;
    };

interface ReviewInput {
  anchorPng: Buffer;
  topologyProof?: Buffer;
  candidates: Buffer[];
  manifestSummary?: string;
  // Authoritative bathroom count from plan-geometry.json. Required so we can
  // run a deterministic gate over the VLM verdict.
  lockedBathroomCount?: number;
}

interface ResponsesPayload {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
      refusal?: string;
    }>;
  }>;
  error?: { message?: string };
}

interface ReviewJson {
  acceptedCandidateIndex: number;
  summary: string;
  candidateReviews: LifeSketchCandidateReview[];
}

interface FetchTimeoutOutcome {
  response?: Response;
  timedOut: boolean;
  error?: unknown;
}

function reviewModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.OPENAI_REVIEW_MODEL?.trim() || DEFAULT_REVIEW_MODEL;
}

function dataUrl(png: Buffer): string {
  return `data:image/png;base64,${png.toString("base64")}`;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<FetchTimeoutOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return { response, timedOut: false };
  } catch (err) {
    const aborted =
      controller.signal.aborted ||
      (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError"));
    return { timedOut: aborted, error: err };
  } finally {
    clearTimeout(timer);
  }
}

async function parseResponse(res: Response): Promise<ResponsesPayload> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as ResponsesPayload;
  } catch {
    return { error: { message: text.slice(0, 500) } };
  }
}

function outputText(payload: ResponsesPayload): string | undefined {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text;
  const parts = payload.output
    ?.flatMap((item) => item.content ?? [])
    .map((item) => item.text)
    .filter((text): text is string => Boolean(text?.trim()));
  return parts?.join("\n").trim() || undefined;
}

function parseReviewJson(raw: string | undefined): ReviewJson | undefined {
  if (!raw) return undefined;
  const clean = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    return JSON.parse(clean) as ReviewJson;
  } catch {
    return undefined;
  }
}

function reviewSchema() {
  const check = { type: "string", enum: ["pass", "fail", "uncertain"] };
  return {
    type: "object",
    additionalProperties: false,
    required: ["acceptedCandidateIndex", "summary", "candidateReviews"],
    properties: {
      acceptedCandidateIndex: {
        type: "integer",
        minimum: -1,
        maximum: 9,
        description: "-1 means every candidate is rejected.",
      },
      summary: { type: "string" },
      candidateReviews: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "candidateIndex",
            "status",
            "reasons",
            "observedBathroomCount",
            "checks",
          ],
          properties: {
            candidateIndex: { type: "integer", minimum: 0, maximum: 9 },
            status: { type: "string", enum: ["accepted", "rejected"] },
            reasons: { type: "array", items: { type: "string" } },
            observedBathroomCount: {
              type: "integer",
              minimum: 0,
              maximum: 9,
              description:
                "Number of bathrooms (rooms containing a toilet bowl) visible in this candidate. Household Shelter, service yard, pipeshaft, and kitchen utility WCs do not count if absent in the locked references.",
            },
            checks: {
              type: "object",
              additionalProperties: false,
              required: [
                "roomTopology",
                "windowBalconyDirection",
                "kitchenHsPipeshaft",
                "majorWallMasses",
                "cameraView",
                "bathroomCount",
                "serviceYard",
              ],
              properties: {
                roomTopology: check,
                windowBalconyDirection: check,
                kitchenHsPipeshaft: check,
                majorWallMasses: check,
                cameraView: check,
                bathroomCount: check,
                serviceYard: check,
              },
            },
          },
        },
      },
    },
  };
}

function reviewPrompt(input: ReviewInput): string {
  const lockedBath = input.lockedBathroomCount;
  return [
    "Return JSON only. Review GPT Image 2 Life Sketch candidates against the locked structural references.",
    "Image order: image 1 is the locked camera-view greybox anchor, image 2 is the top-down topology proof, then candidate images begin at image 3.",
    "Reject a candidate if the room topology, room count, bathroom count, bedroom corridor-door access, window or balcony side, kitchen/Household Shelter/service/pipeshaft relationship, major wall masses, or camera viewpoint drift from images 1 and 2.",
    "Reject if Household Shelter, service yard, pipeshaft, or wet-zone overlays are rendered as an extra toilet, shower, or bathroom.",
    "Reject if the main bedroom loses its corridor/circulation door and appears accessible only through a bathroom when the locked manifest lists a main-bedroom circulation door.",
    "Bathroom counting protocol — do this BEFORE setting any check or status:",
    "  1. Scan each candidate image rectangle by rectangle. Count only rooms that contain a visible toilet bowl. A sink or tiled floor alone is not a bathroom.",
    "  2. Do not count Household Shelter, service yard, pipeshaft cabinet, kitchen utility, or storage cells as bathrooms.",
    "  3. Set observedBathroomCount for the candidate to that integer.",
    lockedBath !== undefined
      ? `  4. The locked plan has exactly ${lockedBath} bathroom(s). If observedBathroomCount is anything other than ${lockedBath}, set checks.bathroomCount = "fail", add reason "bathroom_count_drift" or "household_shelter_as_bathroom", and set status = "rejected".`
      : "  4. If observedBathroomCount disagrees with the locked manifest, set checks.bathroomCount = \"fail\" and reject the candidate.",
    "Service-yard discipline — for every room the locked references mark as a service yard:",
    "  a. Confirm a visible washing machine or stacked washer/dryer appliance is rendered inside the yard.",
    "  b. Confirm a visible floor drain on the yard floor.",
    "  c. Confirm an exterior louvre or louvered window opening (slatted, opens to outside air) is rendered on the yard wall.",
    "  d. The yard must read as a utility space open to outside air — never a sealed closet, blank alcove, second bathroom, second shower, storage cell, or extra bedroom. Reject if it does.",
    "  e. If every requirement above is met, set checks.serviceYard = \"pass\". Otherwise set checks.serviceYard = \"fail\", add the most specific reason from {service_yard_blank, service_yard_enclosed, service_yard_as_bathroom, service_yard_as_bedroom, service_yard_missing_washer, service_yard_missing_drain, service_yard_missing_louvre}, and set status = \"rejected\".",
    "Accept the first candidate that passes every structural check, including bathroomCount and serviceYard. If none pass, set acceptedCandidateIndex to -1 and reject all candidates.",
    "Use concise machine-readable reasons such as room_topology_drift, window_side_drift, hs_pipeshaft_relation_drift, major_wall_mass_drift, camera_view_drift, extra_room, missing_room, bathroom_count_drift, missing_bedroom_corridor_door, household_shelter_as_bathroom, service_yard_as_bathroom, service_yard_blank, service_yard_enclosed, service_yard_missing_washer, service_yard_missing_drain, service_yard_missing_louvre, visible_text, or generic_render_saas_staging.",
    input.manifestSummary ? `Locked manifest summary: ${input.manifestSummary}` : "Locked manifest summary: unavailable.",
    lockedBath !== undefined ? `Locked bathroom count: ${lockedBath}.` : "Locked bathroom count: unavailable.",
  ].join("\n");
}

function requestBody(input: ReviewInput, model: string): Record<string, unknown> {
  const content: Array<Record<string, unknown>> = [
    { type: "input_text", text: reviewPrompt(input) },
    { type: "input_text", text: "Image 1: locked camera-view greybox anchor." },
    { type: "input_image", image_url: dataUrl(input.anchorPng), detail: "high" },
    { type: "input_text", text: "Image 2: top-down topology proof only." },
    { type: "input_image", image_url: dataUrl(input.topologyProof ?? Buffer.alloc(0)), detail: "high" },
  ];

  input.candidates.forEach((candidate, index) => {
    content.push({ type: "input_text", text: `Candidate ${index}.` });
    content.push({ type: "input_image", image_url: dataUrl(candidate), detail: "high" });
  });

  return {
    model,
    input: [{ role: "user", content }],
    text: {
      format: {
        type: "json_schema",
        name: "life_sketch_candidate_review",
        strict: true,
        schema: reviewSchema(),
      },
    },
  };
}

function validateReview(
  review: ReviewJson,
  candidateCount: number,
  lockedBathroomCount: number | undefined,
): LifeSketchReviewResult {
  const accepted = review.acceptedCandidateIndex;
  const reviews = review.candidateReviews.filter((item) => item.candidateIndex >= 0 && item.candidateIndex < candidateCount);
  const acceptedReview = reviews.find((item) => item.candidateIndex === accepted);

  if (accepted < 0 || !acceptedReview || acceptedReview.status !== "accepted") {
    return {
      ok: false,
      reason: "all_candidates_rejected",
      detail: review.summary || "All candidates were rejected by structural QA.",
      candidateReviews: reviews,
      summary: review.summary,
    };
  }

  // Deterministic post-check: the VLM reviewer cannot lie its way through a
  // typed-integer count. If the accepted candidate's observedBathroomCount
  // disagrees with the locked manifest, override the accept and reject the
  // batch. Without this, a candidate with a hallucinated 3rd bathroom (common
  // GPT Image 2 HDB prior) sneaks through because the reviewer answers
  // "all checks pass" without actually counting fixtures.
  if (
    lockedBathroomCount !== undefined &&
    acceptedReview.observedBathroomCount !== lockedBathroomCount
  ) {
    const overridden: LifeSketchCandidateReview[] = reviews.map((item) =>
      item.candidateIndex === accepted
        ? {
            ...item,
            status: "rejected" as const,
            reasons: Array.from(
              new Set([
                ...item.reasons,
                "bathroom_count_drift",
                `observed=${item.observedBathroomCount}_locked=${lockedBathroomCount}`,
              ]),
            ),
            checks: { ...item.checks, bathroomCount: "fail" as const },
          }
        : { ...item, status: "rejected" as const },
    );
    return {
      ok: false,
      reason: "bathroom_count_drift",
      detail: `Accepted candidate observed ${acceptedReview.observedBathroomCount} bathrooms; locked plan has ${lockedBathroomCount}.`,
      candidateReviews: overridden,
      summary: review.summary,
    };
  }

  // Deterministic post-check for the service-yard affordance gate. The VLM
  // sometimes reports a non-passing check inside `checks.serviceYard` while
  // still labelling the candidate "accepted" — a typed-mismatch the JSON schema
  // alone cannot block. Anything except "pass" must reject so uncertainty does
  // not cache a yard rendered as a closet or bathroom.
  if (acceptedReview.checks.serviceYard !== "pass") {
    const overridden: LifeSketchCandidateReview[] = reviews.map((item) =>
      item.candidateIndex === accepted
        ? {
            ...item,
            status: "rejected" as const,
            reasons: Array.from(new Set([...item.reasons, "service_yard_check_failed"])),
          }
        : { ...item, status: "rejected" as const },
    );
    return {
      ok: false,
      reason: "service_yard_check_failed",
      detail:
        "Accepted candidate failed the service-yard affordance check (washer, drain, exterior louvre, not a bathroom).",
      candidateReviews: overridden,
      summary: review.summary,
    };
  }

  return {
    ok: true,
    model: reviewModel(),
    acceptedCandidateIndex: accepted,
    candidateReviews: reviews.map((item) =>
      item.candidateIndex === accepted ? { ...item, status: "accepted" as const } : { ...item, status: "rejected" as const },
    ),
    summary: review.summary,
  };
}

export async function reviewLifeSketchCandidates(input: ReviewInput): Promise<LifeSketchReviewResult> {
  if (!input.topologyProof) {
    return {
      ok: false,
      reason: "missing_topology_proof",
      detail: "Life Sketch candidate QA requires image 2: top-down topology proof.",
    };
  }
  if (input.lockedBathroomCount === undefined) {
    return {
      ok: false,
      reason: "missing_locked_bathroom_count",
      detail:
        "Life Sketch candidate QA requires lockedBathroomCount from plan-geometry.json to enforce the deterministic count gate.",
    };
  }
  if (input.candidates.length < 2) {
    return {
      ok: false,
      reason: "candidate_batch_too_small",
      detail: `Expected 2-3 Life Sketch candidates, received ${input.candidates.length}.`,
    };
  }

  const config = getOpenAIImageConfig();
  if (!config.ok) {
    return { ok: false, reason: "openai_error", detail: config.message };
  }

  const model = reviewModel();
  const outcome = await fetchWithTimeout(
    RESPONSES_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        ...(config.orgId ? { "OpenAI-Organization": config.orgId } : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody(input, model)),
    },
    config.timeoutMs,
  );

  if (outcome.timedOut) {
    return {
      ok: false,
      reason: "openai_timeout",
      detail: `OpenAI candidate review exceeded ${config.timeoutMs} ms.`,
      model,
    };
  }
  if (!outcome.response) {
    return {
      ok: false,
      reason: "openai_unreachable",
      detail: sanitizeOpenAIErrorDetail(outcome.error instanceof Error ? outcome.error.message : undefined) ?? "OpenAI unreachable.",
      model,
    };
  }

  const payload = await parseResponse(outcome.response);
  if (!outcome.response.ok) {
    return {
      ok: false,
      reason: "openai_error",
      detail: sanitizeOpenAIErrorDetail(payload.error?.message) ?? "OpenAI candidate review failed.",
      model,
    };
  }

  const parsed = parseReviewJson(outputText(payload));
  if (!parsed) {
    return {
      ok: false,
      reason: "openai_error",
      detail: "OpenAI candidate review did not return parseable JSON.",
      model,
    };
  }

  const validated = validateReview(parsed, input.candidates.length, input.lockedBathroomCount);
  return validated.ok ? { ...validated, model } : { ...validated, model };
}
