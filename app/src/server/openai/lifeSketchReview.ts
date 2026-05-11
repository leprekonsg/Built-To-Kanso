import { getOpenAIImageConfig, sanitizeOpenAIErrorDetail } from "./client";

const RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_REVIEW_MODEL = "gpt-4.1-mini";

export type LifeSketchReviewCheck = "pass" | "fail" | "uncertain";

export interface LifeSketchCandidateReview {
  candidateIndex: number;
  status: "accepted" | "rejected";
  reasons: string[];
  checks: {
    roomTopology: LifeSketchReviewCheck;
    windowBalconyDirection: LifeSketchReviewCheck;
    kitchenHsPipeshaft: LifeSketchReviewCheck;
    majorWallMasses: LifeSketchReviewCheck;
    cameraView: LifeSketchReviewCheck;
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
        | "candidate_batch_too_small"
        | "all_candidates_rejected"
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
          required: ["candidateIndex", "status", "reasons", "checks"],
          properties: {
            candidateIndex: { type: "integer", minimum: 0, maximum: 9 },
            status: { type: "string", enum: ["accepted", "rejected"] },
            reasons: { type: "array", items: { type: "string" } },
            checks: {
              type: "object",
              additionalProperties: false,
              required: [
                "roomTopology",
                "windowBalconyDirection",
                "kitchenHsPipeshaft",
                "majorWallMasses",
                "cameraView",
              ],
              properties: {
                roomTopology: check,
                windowBalconyDirection: check,
                kitchenHsPipeshaft: check,
                majorWallMasses: check,
                cameraView: check,
              },
            },
          },
        },
      },
    },
  };
}

function reviewPrompt(input: ReviewInput): string {
  return [
    "Return JSON only. Review GPT Image 2 Life Sketch candidates against the locked structural references.",
    "Image order: image 1 is the locked camera-view greybox anchor, image 2 is the top-down topology proof, then candidate images begin at image 3.",
    "Reject a candidate if the room topology, room count, window or balcony side, kitchen/Household Shelter/service/pipeshaft relationship, major wall masses, or camera viewpoint drift from images 1 and 2.",
    "Accept the first candidate that passes every structural check. If none pass, set acceptedCandidateIndex to -1 and reject all candidates.",
    "Use concise machine-readable reasons such as room_topology_drift, window_side_drift, hs_pipeshaft_relation_drift, major_wall_mass_drift, camera_view_drift, extra_room, missing_room, visible_text, or generic_render_saas_staging.",
    input.manifestSummary ? `Locked manifest summary: ${input.manifestSummary}` : "Locked manifest summary: unavailable.",
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

function validateReview(review: ReviewJson, candidateCount: number): LifeSketchReviewResult {
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

  const validated = validateReview(parsed, input.candidates.length);
  return validated.ok ? { ...validated, model } : { ...validated, model };
}
