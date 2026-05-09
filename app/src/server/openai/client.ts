// Thin wrapper around the OpenAI Images REST API.
//
// We use built-in fetch + FormData rather than the openai SDK so we keep the
// bundle small (per Vercel React best practice "bundle-defer-third-party"
// and the Built-To-Kanso pinning policy in CLAUDE.md).
//
// The wrapper never logs the API key. The optional OPENAI_ORG_ID is sent as
// the OpenAI-Organization header when present.
//
// All requests run under an AbortController-driven timeout so a hung upstream
// can never pin a route. Default is 25 s, overridable via OPENAI_TIMEOUT_MS.

import type { ImagePromptKind } from "@/server/folio/prompts";

const GENERATIONS_URL = "https://api.openai.com/v1/images/generations";
const EDITS_URL = "https://api.openai.com/v1/images/edits";

const DEFAULT_MODEL = "gpt-image-2-2026-04-21";
const DEFAULT_TIMEOUT_MS = 25_000;

export interface OpenAIImageEnv {
  [key: string]: string | undefined;
  OPENAI_API_KEY?: string;
  OPENAI_ORG_ID?: string;
  OPENAI_IMAGE_MODEL?: string;
  OPENAI_TIMEOUT_MS?: string;
}

export type OpenAIImageConfig =
  | { ok: true; apiKey: string; orgId?: string; model: string; timeoutMs: number }
  | { ok: false; reason: "missing_api_key"; message: string };

export type ImageMode = "generate" | "edit";

export interface GenerateRequest {
  mode: "generate";
  promptId: ImagePromptKind;
  prompt: string;
  size?: string;
  model?: string;
  timeoutMs?: number;
}

export interface EditRequest {
  mode: "edit";
  promptId: ImagePromptKind;
  prompt: string;
  image: Buffer;
  // Optional secondary structural/atmospheric reference images. Supports the
  // brief Section 16.2 multi-image flow (anchor + brand v3 + Japandi material).
  // Sent as repeated `image[]` form fields per the gpt-image-2 image-edit API.
  referenceImages?: Buffer[];
  mask?: Buffer;
  size?: string;
  model?: string;
  timeoutMs?: number;
}

export type ImageRequest = GenerateRequest | EditRequest;

export type ImageFailureReason =
  | "missing_api_key"
  | "openai_error"
  | "openai_unreachable"
  | "openai_timeout";

export type ImageResult =
  | { ok: true; promptId: ImagePromptKind; png: Buffer }
  | { ok: false; reason: ImageFailureReason; promptId: ImagePromptKind; detail?: string };

interface OpenAIDataResponse {
  data?: Array<{ b64_json?: string }>;
  error?: { message?: string };
}

async function parseOpenAIResponse(res: Response): Promise<OpenAIDataResponse> {
  const text = await res.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as OpenAIDataResponse;
  } catch {
    return {
      error: {
        message: text.slice(0, 500),
      },
    };
  }
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

export function getOpenAIImageConfig(env: OpenAIImageEnv = process.env): OpenAIImageConfig {
  if (!env.OPENAI_API_KEY) {
    return {
      ok: false,
      reason: "missing_api_key",
      message: "OPENAI_API_KEY is required to generate or polish sketch images. Set it, or rely on cached/deterministic SVG outputs.",
    };
  }

  return {
    ok: true,
    apiKey: env.OPENAI_API_KEY,
    orgId: env.OPENAI_ORG_ID,
    model: env.OPENAI_IMAGE_MODEL ?? DEFAULT_MODEL,
    timeoutMs: parsePositiveInt(env.OPENAI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
  };
}

export function sanitizeOpenAIErrorDetail(detail: string | undefined, env: OpenAIImageEnv = process.env): string | undefined {
  if (!detail) return undefined;
  let safe = detail;
  for (const secret of [env.OPENAI_API_KEY, env.OPENAI_ORG_ID]) {
    if (secret) safe = safe.replaceAll(secret, "[redacted]");
  }
  return safe;
}

function authHeaders(config: Extract<OpenAIImageConfig, { ok: true }>): Record<string, string> {
  const headers: Record<string, string> = { Authorization: `Bearer ${config.apiKey}` };
  if (config.orgId) headers["OpenAI-Organization"] = config.orgId;
  return headers;
}

function decodeFirstImage(payload: OpenAIDataResponse): Buffer | null {
  const b64 = payload.data?.[0]?.b64_json;
  if (!b64) return null;
  return Buffer.from(b64, "base64");
}

interface FetchTimeoutOutcome {
  response?: Response;
  timedOut: boolean;
  error?: unknown;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<FetchTimeoutOutcome> {
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

export async function callOpenAIImage(req: ImageRequest): Promise<ImageResult> {
  const config = getOpenAIImageConfig();
  if (!config.ok) {
    return { ok: false, reason: "missing_api_key", promptId: req.promptId, detail: config.message };
  }

  const model = req.model ?? config.model;
  const timeoutMs = req.timeoutMs && req.timeoutMs > 0 ? req.timeoutMs : config.timeoutMs;

  if (req.mode === "generate") {
    const body: Record<string, unknown> = {
      model,
      prompt: req.prompt,
      output_format: "png",
      size: req.size ?? "1024x1024",
      n: 1,
    };

    const outcome = await fetchWithTimeout(
      GENERATIONS_URL,
      {
        method: "POST",
        headers: { ...authHeaders(config), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      timeoutMs,
    );

    if (outcome.timedOut) {
      return {
        ok: false,
        reason: "openai_timeout",
        promptId: req.promptId,
        detail: `OpenAI image request exceeded ${timeoutMs} ms.`,
      };
    }
    if (!outcome.response) {
      return {
        ok: false,
        reason: "openai_unreachable",
        promptId: req.promptId,
        detail: sanitizeOpenAIErrorDetail(outcome.error instanceof Error ? outcome.error.message : undefined),
      };
    }
    const json = await parseOpenAIResponse(outcome.response);
    if (!outcome.response.ok) {
      return { ok: false, reason: "openai_error", promptId: req.promptId, detail: sanitizeOpenAIErrorDetail(json.error?.message) };
    }
    const png = decodeFirstImage(json);
    if (!png) {
      return { ok: false, reason: "openai_error", promptId: req.promptId, detail: "empty response" };
    }
    return { ok: true, promptId: req.promptId, png };
  }

  const form = new FormData();
  form.set("model", model);
  form.set("prompt", req.prompt);
  form.set("output_format", "png");
  form.set("size", req.size ?? "1024x1024");
  form.set("n", "1");
  form.append(
    "image[]",
    new Blob([new Uint8Array(req.image)], { type: "image/png" }),
    "image-0.png",
  );
  if (req.referenceImages?.length) {
    req.referenceImages.forEach((buf, idx) => {
      form.append(
        "image[]",
        new Blob([new Uint8Array(buf)], { type: "image/png" }),
        `image-${idx + 1}.png`,
      );
    });
  }
  if (req.mask) {
    form.set(
      "mask",
      new Blob([new Uint8Array(req.mask)], { type: "image/png" }),
      "mask.png",
    );
  }

  const outcome = await fetchWithTimeout(
    EDITS_URL,
    {
      method: "POST",
      headers: authHeaders(config),
      body: form,
    },
    timeoutMs,
  );

  if (outcome.timedOut) {
    return {
      ok: false,
      reason: "openai_timeout",
      promptId: req.promptId,
      detail: `OpenAI image request exceeded ${timeoutMs} ms.`,
    };
  }
  if (!outcome.response) {
    return {
      ok: false,
      reason: "openai_unreachable",
      promptId: req.promptId,
      detail: sanitizeOpenAIErrorDetail(outcome.error instanceof Error ? outcome.error.message : undefined),
    };
  }
  const json = await parseOpenAIResponse(outcome.response);
  if (!outcome.response.ok) {
    return { ok: false, reason: "openai_error", promptId: req.promptId, detail: sanitizeOpenAIErrorDetail(json.error?.message) };
  }
  const png = decodeFirstImage(json);
  if (!png) {
    return { ok: false, reason: "openai_error", promptId: req.promptId, detail: "empty response" };
  }
  return { ok: true, promptId: req.promptId, png };
}
