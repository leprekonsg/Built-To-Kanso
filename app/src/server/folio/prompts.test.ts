import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OPENAI_IMAGE_PROMPTS } from "./prompts";

describe("OpenAI image prompt discipline", () => {
  it("keeps geometry-sensitive edit prompts subordinate to locked inputs", () => {
    for (const kind of [
      "plan-sketch-style-transfer",
      "life-sketch-from-anchor",
      "wind-sketch-export-polish",
      "wind-sketch-micro-polish",
      "resonance-hour-background",
      "material-reveal-demo-frame",
    ] as const) {
      const prompt = OPENAI_IMAGE_PROMPTS[kind].prompt;

      assert.match(prompt, /Source of truth:/);
      assert.match(prompt, /Change only:/);
      assert.match(prompt, /Preserve exactly:/);
      assert.match(prompt, /Reject output if:/);
    }
  });

  it("does not overclaim image-model geometric certainty", () => {
    const allPrompts = Object.values(OPENAI_IMAGE_PROMPTS)
      .map((spec) => spec.prompt)
      .join("\n");

    assert.doesNotMatch(allPrompts, /ZERO DEVIATION/i);
    assert.doesNotMatch(allPrompts, /MUST MATCH BLUEPRINT/i);
    assert.doesNotMatch(allPrompts, /absolute source of truth for the render/i);
  });

  it("marks generated hero imagery as visual rather than compliance evidence", () => {
    const prompt = OPENAI_IMAGE_PROMPTS["empty-room-hero"].prompt;

    assert.match(prompt, /not a compliance drawing/);
    assert.match(prompt, /remove rather than place/i);
    assert.match(prompt, /Reject output if:/);
  });
});
