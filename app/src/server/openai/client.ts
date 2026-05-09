// Thin wrapper around the OpenAI Images REST API.
//
// We use built-in fetch + FormData rather than the openai SDK so we keep the
// bundle small (per Vercel React best practice "bundle-defer-third-party"
// and the Built-To-Kanso pinning policy in CLAUDE.md).
//
// The wrapper never logs the API key. The optional OPENAI_ORG_ID is sent as
// the OpenAI-Organization header when present.

import type { ImagePromptKind } from "@/server/folio/prompts";

const GENERATIONS_URL = "https://api.openai.com/v1/images/generations";
const EDITS_URL = "https://api.openai.com/v1/images/edits";

const DEFAULT_MODEL = "gpt-image-2";

export type ImageMode = "generate" | "edit";

export interface GenerateRequest {
  mode: "generate";
  promptId: ImagePromptKind;
  prompt: string;
  seed?: string;
  size?: string;
  model?: string;
}

export interface EditRequest {
  mode: "edit";
  promptId: ImagePromptKind;
  prompt: string;
  image: Buffer;
  mask?: Buffer;
  size?: string;
  model?: string;
}

export type ImageRequest = GenerateRequest | EditRequest;

export type ImageResult =
  | { ok: true; promptId: ImagePromptKind; png: Buffer }
  | { ok: false; reason: "missing_api_key" | "openai_error" | "openai_unreachable"; promptId: ImagePromptKind; detail?: string };

interface OpenAIDataResponse {
  data?: Array<{ b64_json?: string }>;
  error?: { message?: string };
}

function authHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
  const org = process.env.OPENAI_ORG_ID;
  if (org) headers["OpenAI-Organization"] = org;
  return headers;
}

function decodeFirstImage(payload: OpenAIDataResponse): Buffer | null {
  const b64 = payload.data?.[0]?.b64_json;
  if (!b64) return null;
  return Buffer.from(b64, "base64");
}

export async function callOpenAIImage(req: ImageRequest): Promise<ImageResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: "missing_api_key", promptId: req.promptId };
  }

  const model = req.model ?? DEFAULT_MODEL;

  try {
    if (req.mode === "generate") {
      const body: Record<string, unknown> = {
        model,
        prompt: req.prompt,
        response_format: "b64_json",
        size: req.size ?? "1024x1024",
        n: 1,
      };
      if (req.seed) body.seed = req.seed;

      const res = await fetch(GENERATIONS_URL, {
        method: "POST",
        headers: { ...authHeaders(apiKey), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as OpenAIDataResponse;
      if (!res.ok) {
        return { ok: false, reason: "openai_error", promptId: req.promptId, detail: json.error?.message };
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
    form.set("response_format", "b64_json");
    form.set("size", req.size ?? "1024x1024");
    form.set("n", "1");
    form.set(
      "image",
      new Blob([new Uint8Array(req.image)], { type: "image/png" }),
      "image.png",
    );
    if (req.mask) {
      form.set(
        "mask",
        new Blob([new Uint8Array(req.mask)], { type: "image/png" }),
        "mask.png",
      );
    }

    const res = await fetch(EDITS_URL, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: form,
    });
    const json = (await res.json()) as OpenAIDataResponse;
    if (!res.ok) {
      return { ok: false, reason: "openai_error", promptId: req.promptId, detail: json.error?.message };
    }
    const png = decodeFirstImage(json);
    if (!png) {
      return { ok: false, reason: "openai_error", promptId: req.promptId, detail: "empty response" };
    }
    return { ok: true, promptId: req.promptId, png };
  } catch (err) {
    return {
      ok: false,
      reason: "openai_unreachable",
      promptId: req.promptId,
      detail: err instanceof Error ? err.message : undefined,
    };
  }
}
