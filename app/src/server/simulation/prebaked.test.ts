import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TOKEN_IDS } from "@/server/rules/tokens";
import {
  buildTier4PrebakeCacheKey,
  buildTier4PrebakeMatrix,
  DEFAULT_TIER4_WEATHER_CONDITION,
  TIER4_TEMPLATE_CANDIDATE_COUNT,
  lookupTier4Prebake,
} from "./prebaked";

describe("Tier 4 prebake matrix", () => {
  it("builds deterministic coverage for three templates, six tokens, and bounded candidates", () => {
    const matrix = buildTier4PrebakeMatrix();

    assert.equal(matrix.templateCount, 3);
    assert.equal(matrix.tokenCount, TOKEN_IDS.length);
    assert.equal(matrix.candidateCountPerTemplate, TIER4_TEMPLATE_CANDIDATE_COUNT);
    assert.equal(matrix.baseCellCount, 3 * TOKEN_IDS.length * TIER4_TEMPLATE_CANDIDATE_COUNT);
    assert.equal(matrix.entries.length, matrix.baseCellCount);
    assert.equal(new Set(matrix.entries.map((entry) => entry.key)).size, matrix.entries.length);
  });

  it("cache keys include template, placements, candidate positions, and weather", () => {
    const base = buildTier4PrebakeCacheKey({
      templateId: "resale-exec-1990s",
      tokenPlacements: [{ tokenId: "shaft_buffer", point: { x: 5.4, y: 3.95 } }],
      candidatePositions: [{ tokenId: "wind_gate", point: { x: 12.2, y: 7.7 } }],
      weatherCondition: DEFAULT_TIER4_WEATHER_CONDITION,
    });

    assert.notEqual(
      base,
      buildTier4PrebakeCacheKey({
        templateId: "tengah-5room",
        tokenPlacements: [{ tokenId: "shaft_buffer", point: { x: 5.4, y: 3.95 } }],
        candidatePositions: [{ tokenId: "wind_gate", point: { x: 12.2, y: 7.7 } }],
        weatherCondition: DEFAULT_TIER4_WEATHER_CONDITION,
      }),
    );
    assert.notEqual(
      base,
      buildTier4PrebakeCacheKey({
        templateId: "resale-exec-1990s",
        tokenPlacements: [{ tokenId: "wind_gate", point: { x: 5.4, y: 3.95 } }],
        candidatePositions: [{ tokenId: "wind_gate", point: { x: 12.2, y: 7.7 } }],
        weatherCondition: DEFAULT_TIER4_WEATHER_CONDITION,
      }),
    );
    assert.notEqual(
      base,
      buildTier4PrebakeCacheKey({
        templateId: "resale-exec-1990s",
        tokenPlacements: [{ tokenId: "shaft_buffer", point: { x: 5.4, y: 3.95 } }],
        candidatePositions: [{ tokenId: "wind_gate", point: { x: 12.1, y: 7.7 } }],
        weatherCondition: DEFAULT_TIER4_WEATHER_CONDITION,
      }),
    );
    assert.notEqual(
      base,
      buildTier4PrebakeCacheKey({
        templateId: "resale-exec-1990s",
        tokenPlacements: [{ tokenId: "shaft_buffer", point: { x: 5.4, y: 3.95 } }],
        candidatePositions: [{ tokenId: "wind_gate", point: { x: 12.2, y: 7.7 } }],
        weatherCondition: "ne_monsoon_wind",
      }),
    );
  });

  it("normalizes placement order without collapsing distinct candidate lookups", () => {
    const first = buildTier4PrebakeCacheKey({
      templateId: "tampines-greenweave",
      tokenPlacements: [
        { tokenId: "wind_gate", point: { x: 8.8, y: 1.2 } },
        { tokenId: "soft_screen", point: { x: 4.4, y: 6.6 } },
      ],
      candidatePositions: [{ tokenId: "fan_anchor", point: { x: 5, y: 5 } }],
      weatherCondition: "highway_night",
    });
    const same = buildTier4PrebakeCacheKey({
      templateId: "tampines-greenweave",
      tokenPlacements: [
        { tokenId: "soft_screen", point: { x: 4.4, y: 6.6 } },
        { tokenId: "wind_gate", point: { x: 8.8, y: 1.2 } },
      ],
      candidatePositions: [{ tokenId: "fan_anchor", point: { x: 5, y: 5 } }],
      weatherCondition: "highway_night",
    });
    const differentCandidate = buildTier4PrebakeCacheKey({
      templateId: "tampines-greenweave",
      tokenPlacements: [
        { tokenId: "soft_screen", point: { x: 4.4, y: 6.6 } },
        { tokenId: "wind_gate", point: { x: 8.8, y: 1.2 } },
      ],
      candidatePositions: [{ tokenId: "fan_anchor", point: { x: 5.1, y: 5 } }],
      weatherCondition: "highway_night",
    });

    assert.equal(first, same);
    assert.notEqual(first, differentCandidate);
  });

  it("returns stable lookup metadata for designer provenance", () => {
    const first = lookupTier4Prebake({
      templateId: "resale-exec-1990s",
      tokenPlacements: [{ tokenId: "shaft_buffer", point: { x: 5.4, y: 3.95 } }],
      candidatePositions: [{ tokenId: "shaft_buffer", point: { x: 5.4, y: 3.95 } }],
      weatherCondition: "west_sun_1720",
    });
    const second = lookupTier4Prebake({
      templateId: "resale-exec-1990s",
      tokenPlacements: [{ tokenId: "shaft_buffer", point: { x: 5.4, y: 3.95 } }],
      candidatePositions: [{ tokenId: "shaft_buffer", point: { x: 5.4, y: 3.95 } }],
      weatherCondition: "west_sun_1720",
    });

    assert.deepEqual(first, second);
    assert.equal(first.meta.cacheKey.includes("resale-exec-1990s"), true);
    assert.equal(first.meta.weatherCondition, "west_sun_1720");
    assert.equal(first.meta.matrix.baseCellCount, 270);
    assert.equal(first.meta.lookup.matched, true);
  });

  it("does not present a shaft buffer as a simulated shaft-speed benefit", () => {
    const baseline = lookupTier4Prebake({
      templateId: "resale-exec-1990s",
      tokenPlacements: [],
      weatherCondition: DEFAULT_TIER4_WEATHER_CONDITION,
    });
    const buffered = lookupTier4Prebake({
      templateId: "resale-exec-1990s",
      tokenPlacements: [{ tokenId: "shaft_buffer", point: { x: 5.4, y: 3.95 } }],
      weatherCondition: DEFAULT_TIER4_WEATHER_CONDITION,
    });
    const shaftLineSpeeds = (value: typeof baseline) => value.field.streamlines
      .filter((line) => line.id.includes("shaft"))
      .map((line) => line.speedMps);
    const shaftParticleSpeeds = (value: typeof baseline) => value.field.particles
      .filter((particle) => particle.kind === "pipeshaft_drift")
      .map((particle) => particle.speedMps);

    assert.deepEqual(shaftLineSpeeds(buffered), shaftLineSpeeds(baseline));
    assert.deepEqual(shaftParticleSpeeds(buffered), shaftParticleSpeeds(baseline));
  });
});
