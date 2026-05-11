import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  callOpenAIImage,
  getOpenAIImageConfig,
  getOpenAIImageModel,
  normalizeOpenAIImageModel,
  sanitizeOpenAIErrorDetail,
} from "./client";

describe("OpenAI image client config", () => {
  it("reports an actionable missing-key error without calling OpenAI", () => {
    const config = getOpenAIImageConfig({});

    assert.equal(config.ok, false);
    if (config.ok) return;

    assert.equal(config.reason, "missing_api_key");
    assert.match(config.message, /OPENAI_API_KEY/);
  });

  it("does not echo configured secrets in OpenAI error detail", () => {
    const detail = sanitizeOpenAIErrorDetail(
      "Request failed with sk-live-secret and org_abc_secret",
      {
        OPENAI_API_KEY: "sk-live-secret",
        OPENAI_ORG_ID: "org_abc_secret",
      },
    );

    assert.ok(detail);
    assert.doesNotMatch(detail, /sk-live-secret/);
    assert.doesNotMatch(detail, /org_abc_secret/);
    assert.match(detail, /\[redacted\]/);
  });

  it("normalizes common ChatGPT Image 2 labels to the GPT Image 2 API model", () => {
    assert.equal(getOpenAIImageModel({}), "gpt-image-2");
    assert.equal(getOpenAIImageModel({ OPENAI_IMAGE_MODEL: "ChatGPT Image 2.0" }), "gpt-image-2");
    assert.equal(normalizeOpenAIImageModel("gpt_image_2"), "gpt-image-2");
    assert.equal(normalizeOpenAIImageModel("chatgpt-image-latest"), "chatgpt-image-latest");
  });

  it("sends the current GPT Image 2 generation payload shape", async () => {
    const originalFetch = globalThis.fetch;
    const originalKey = process.env.OPENAI_API_KEY;
    let body: Record<string, unknown> | undefined;

    process.env.OPENAI_API_KEY = "sk-test-generation";
    globalThis.fetch = (async (_url, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({ data: [{ b64_json: Buffer.from("png").toString("base64") }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const result = await callOpenAIImage({
        mode: "generate",
        promptId: "empty-room-hero",
        prompt: "Generate a quiet room.",
      });

      assert.equal(result.ok, true);
      if (result.ok) assert.equal(result.candidates.length, 1);
      assert.equal(body?.model, "gpt-image-2");
      assert.equal(body?.output_format, "png");
      assert.equal(body?.size, "1024x1024");
      assert.equal(body?.n, 1);
      assert.equal("response_format" in (body ?? {}), false);
      assert.equal("seed" in (body ?? {}), false);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalKey;
      }
    }
  });

  it("sends image-edit references with output_format and without response_format", async () => {
    const originalFetch = globalThis.fetch;
    const originalKey = process.env.OPENAI_API_KEY;
    let form: FormData | undefined;

    process.env.OPENAI_API_KEY = "sk-test-edit";
    globalThis.fetch = (async (_url, init) => {
      form = init?.body as FormData;
      return new Response(
        JSON.stringify({ data: [{ b64_json: Buffer.from("png").toString("base64") }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const result = await callOpenAIImage({
        mode: "edit",
        promptId: "life-sketch-from-anchor",
        prompt: "Preserve geometry.",
        image: Buffer.from("anchor"),
        referenceImages: [Buffer.from("style")],
        n: 3,
        size: "1536x1024",
      });

      assert.equal(result.ok, true);
      if (result.ok) assert.equal(result.candidates.length, 1);
      assert.equal(form?.get("model"), "gpt-image-2");
      assert.equal(form?.get("output_format"), "png");
      assert.equal(form?.get("size"), "1536x1024");
      assert.equal(form?.get("n"), "3");
      assert.equal(form?.get("response_format"), null);
      assert.equal(form?.getAll("image[]").length, 2);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalKey;
      }
    }
  });

  it("reports non-JSON OpenAI failures as sanitized OpenAI errors", async () => {
    const originalFetch = globalThis.fetch;
    const originalKey = process.env.OPENAI_API_KEY;

    process.env.OPENAI_API_KEY = "sk-test-error";
    globalThis.fetch = (async () => new Response("gateway timeout sk-test-error", { status: 502 })) as typeof fetch;

    try {
      const result = await callOpenAIImage({
        mode: "generate",
        promptId: "empty-room-hero",
        prompt: "Generate a quiet room.",
      });

      assert.equal(result.ok, false);
      if (result.ok) return;

      assert.equal(result.reason, "openai_error");
      assert.match(result.detail ?? "", /gateway timeout/);
      assert.doesNotMatch(result.detail ?? "", /sk-test-error/);
      assert.match(result.detail ?? "", /\[redacted\]/);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalKey;
      }
    }
  });
});
