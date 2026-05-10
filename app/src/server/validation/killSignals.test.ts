import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateKillSignals, type KillSignalInput } from "./killSignals";

function feedback(lines: string[]): KillSignalInput[] {
  return lines.map((text, index) => ({ userId: `u${index + 1}`, text }));
}

describe("Phase 0.5 kill signal monitors", () => {
  it("trips Damp diagnosis drift when more than one in five users describe measurement or diagnosis", () => {
    const results = evaluateKillSignals(feedback([
      "It feels like a mould diagnosis.",
      "This looks like an RH measurement.",
      "I would use it as a humidity sensor reading.",
      "The band gave me a layout conversation starter.",
      "I noticed the Shaft Buffer suggestion.",
      "The plan still feels like a sketch.",
      "It made me ask about exhaust timing.",
      "The bedroom note was calm.",
      "I understood it as prototype visualisation.",
      "The label said not a medical assessment.",
    ]));

    const damp = results.find((result) => result.id === "damp_health_diagnosis_drift");
    assert.equal(damp?.threshold, 3);
    assert.equal(damp?.matches, 3);
    assert.equal(damp?.tripped, true);
  });

  it("trips cultural fortune-telling drift on luck or prosperity interpretation", () => {
    const results = evaluateKillSignals(feedback([
      "This predicts wealth for the family.",
      "It says the room is lucky.",
      "The airflow label felt practical.",
      "I saw the evidence tier.",
      "The Scout copy was calm.",
    ]));

    const cultural = results.find((result) => result.id === "cultural_fortune_telling_drift");
    assert.equal(cultural?.threshold, 2);
    assert.equal(cultural?.matches, 2);
    assert.equal(cultural?.tripped, true);
  });

  it("trips visual-overpowering drift when users remember renders but not protections", () => {
    const results = evaluateKillSignals(feedback([
      "I mostly remember the render.",
      "I did not notice the Black-state rule.",
      "I do not remember bathroom downwind protection.",
      "The SVG helped me understand the plan.",
      "The disclaimer was clear.",
      "I saw the token tray.",
      "The Damp band was paired with an action.",
      "It looked like a design discussion.",
      "The push-disabled note was clear.",
      "I noticed the prototype label.",
    ]));

    const visual = results.find((result) => result.id === "visual_overpowering_trust_layer");
    assert.equal(visual?.threshold, 3);
    assert.equal(visual?.matches, 3);
    assert.equal(visual?.tripped, true);
  });

  it("does not trip on empty or below-threshold feedback batches", () => {
    assert.equal(evaluateKillSignals([]).every((result) => result.tripped === false), true);

    const results = evaluateKillSignals(feedback([
      "I mostly remember the render.",
      "The evidence label was clear.",
      "The bathroom downwind rule was clear.",
      "The Damp band felt like a discussion.",
      "The plan stayed locked.",
    ]));
    assert.equal(results.every((result) => result.tripped === false), true);
  });
});
