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

  it("keeps Life Sketch materialization anchored and free of generic AI-render cues", () => {
    const prompt = OPENAI_IMAGE_PROMPTS["life-sketch-from-anchor"].prompt;

    assert.match(prompt, /LOCKED CAMERA AND VISIBLE GEOMETRY/);
    assert.match(prompt, /Image 2 is topology reference only/i);
    assert.match(prompt, /do not convert to a different viewpoint/i);
    assert.match(prompt, /Household Shelter\/service\/pipeshaft relationship/);
    assert.match(prompt, /every internal door position/);
    assert.match(prompt, /render only the bathrooms shown/i);
    assert.match(prompt, /main bedroom must not be accessible only through a bathroom/i);
    assert.match(prompt, /no bathroom fixtures in Household Shelter/i);
    assert.match(prompt, /token centerpoints/);
    assert.match(prompt, /token bounding boxes/);
    assert.match(prompt, /no generic luxury Japandi room/);
    assert.match(prompt, /plastic-AI-render sheen/);
    assert.match(prompt, /HDR clarity/);
    assert.match(prompt, /anime/);
    assert.match(prompt, /manga/);
    assert.match(prompt, /showroom CGI/);
    assert.match(prompt, /not compliance evidence/);
  });
});
