import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  EMPTY_ROOM_HERO_VARIANT_CUES,
  HERO_ROTATION_COUNT,
} from "@/server/openai/sketches";
import { GET } from "./route";

describe("Empty Room hero route", () => {
  it("serves all five sealed prebaked rotations without an OpenAI call", async () => {
    for (let rotation = 0; rotation < HERO_ROTATION_COUNT; rotation += 1) {
      const publicAsset = await readFile(`public/hero/empty-room-${rotation}.png`);
      const response = await GET(new Request(`https://example.com/api/sketches/hero?rotation=${rotation}`));
      const bytes = Buffer.from(await response.arrayBuffer());

      assert.equal(publicAsset.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "image/png");
      assert.equal(response.headers.get("x-from-cache"), "prebake");
      assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    }
  });

  it("keeps the sealed rotation cues inside the Phase 0 tropical-light constraint", () => {
    const cues = EMPTY_ROOM_HERO_VARIANT_CUES.map((cue) => cue.toLowerCase());

    assert.ok(
      cues.filter((cue) => cue.includes("morning") && cue.includes("east")).length >= 2,
      "Empty Room rotation needs at least two morning east-light scenes.",
    );
    assert.ok(
      cues.some((cue) => cue.includes("evening") && cue.includes("west-amber")),
      "Empty Room rotation needs at least one evening west-amber scene.",
    );
    assert.ok(
      cues.every((cue) => !cue.includes("high-noon") && !cue.includes("high noon") && !cue.includes("south-dominant")),
      "Empty Room rotation must not include high-noon south-dominant scenes.",
    );
  });
});
