import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GET, POST } from "./route";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/validation/phase1-readiness", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/validation/phase1-readiness", () => {
  it("returns an honest aggregate Phase 1 status", async () => {
    const response = await GET();
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.repoImplementationComplete, true);
    assert.equal(body.implementation.total, 2);
    assert.equal(body.renderAssets.ok, false);
    assert.equal(body.phase0.requirements.length, 0);
    assert.equal(body.operational.requirements.length, 0);
    assert.equal(body.complete, false);
    assert.equal(body.demoReady, false);
    assert.ok(body.demoBlockers.some((blocker: string) => blocker.startsWith("geometry_review:")));
    assert.ok(body.blockers.length > 0);
  });

  it("evaluates posted Phase 0 evidence in aggregate", async () => {
    const response = await POST(jsonRequest({
      phase0Evidence: {
        webgpu_redmi_benchmark: {
          device: "Redmi Note 13",
          fpsSamples: [31, 30, 32, 29, 33],
          tier4LookupSamples: [
            { templateId: "resale-exec-1990s", lookupMs: [75, 83] },
            { templateId: "tampines-greenweave", lookupMs: [68, 74] },
            { templateId: "tengah-5room", lookupMs: [72, 79] },
          ],
        },
      },
    }));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.phase0.items.length, 0);
    assert.equal(body.phase0.pendingExternal, 0);
    assert.equal(body.demoReady, false);
  });

  it("evaluates non-secret operational evidence in aggregate", async () => {
    const response = await POST(jsonRequest({
      operationalEvidence: {
        openaiTier2Account: {
          verified: true,
          verifiedAtIso: "2026-05-10T00:00:00.000Z",
          reviewer: "demo-operator",
        },
      },
    }));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.operational.checks.length, 0);
    assert.ok(body.blockers.every((blocker: string) => !blocker.includes("openai_tier2_account")));
    assert.doesNotMatch(JSON.stringify(body), /demo-operator/);
  });

  it("retains geometry blockers when POST receives external evidence and live env inputs", async () => {
    await withEnv(
      {
        OPENAI_API_KEY: "sk-test",
        NEA_API_KEY: "nea-test",
        SKETCH_CACHE_PROVIDER: "memory",
      },
      async () => {
        const response = await POST(jsonRequest({
          phase0Evidence: completePhase0Evidence(),
          operationalEvidence: {
            openaiTier2Account: {
              verified: true,
              verifiedAtIso: "2026-05-10T00:00:00.000Z",
            },
          },
        }));
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(body.complete, false);
        assert.equal(body.demoReady, false);
        assert.equal(body.phase0.pendingExternal, 0);
        assert.equal(body.operational.complete, true);
        assert.ok(body.blockers.some((blocker: string) => blocker.startsWith("geometry_review:")));
      },
    );
  });

  it("rejects malformed aggregate evidence payloads", async () => {
    const response = await POST(jsonRequest({ phase0Evidence: [] }));
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.error, /phase0Evidence must be an object/);
  });

  it("rejects malformed operational evidence payloads", async () => {
    const response = await POST(jsonRequest({ operationalEvidence: [] }));
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.error, /operationalEvidence must be an object/);
  });
});

async function withEnv(values: Record<string, string>, callback: () => Promise<void>): Promise<void> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function completePhase0Evidence() {
  return {
    empty_room_beauty: {
      renderOutcomes: Array.from({ length: 20 }, (_, index) => ({
        renderId: `e${index}`,
        beautiful: index < 12,
        morningEastLight: index < 2,
        eveningWestAmber: index === 2,
        highNoonSouthDominant: false,
      })),
    },
    life_sketch_preservation: {
      templateOutcomes: [
        preservedLifeSketch("resale-exec-1990s"),
        preservedLifeSketch("tampines-greenweave"),
        preservedLifeSketch("tengah-5room"),
      ],
    },
    webgpu_redmi_benchmark: {
      device: "Redmi Note 13",
      fpsSamples: [31, 30, 32, 29, 33],
      tier4LookupSamples: [
        { templateId: "resale-exec-1990s", lookupMs: [75, 83] },
        { templateId: "tampines-greenweave", lookupMs: [68, 74] },
        { templateId: "tengah-5room", lookupMs: [72, 79] },
      ],
    },
    live_studio_comprehension: {
      testerOutcomes: Array.from({ length: 10 }, (_, index) => ({
        testerId: `l${index}`,
        identifiedWindMoving: true,
        identifiedWithinSeconds: index < 8 ? 5 : 6,
      })),
    },
    magic_90_seconds: {
      testerOutcomes: Array.from({ length: 10 }, (_, index) => ({
        testerId: `m${index}`,
        understoodTokenChangesAir: index < 8,
        understoodWithinSeconds: index < 8 ? 30 : 45,
      })),
    },
    behavioral_overconfidence: {
      testerOutcomes: Array.from({ length: 10 }, (_, index) => ({
        testerId: `b${index}`,
        discussionOrientedLanguage: true,
        commitmentLanguage: index >= 8,
      })),
    },
    resonance_historical_wind: {
      templateWeeks: [
        { templateId: "resale-exec-1990s", weeklyFires: [1, 2, 3, 4] },
        { templateId: "tampines-greenweave", weeklyFires: [2, 2, 3, 3] },
        { templateId: "tengah-5room", weeklyFires: [1, 1, 2, 2] },
      ],
    },
    material_slider_comprehension: {
      testerOutcomes: Array.from({ length: 10 }, (_, index) => ({
        testerId: `s${index}`,
        articulatedChange: index < 8,
        withoutPrompting: true,
      })),
    },
  };
}

function preservedLifeSketch(templateId: string) {
  return {
    templateId,
    roomCountsPreserved: true,
    wallTopologyPreserved: true,
    hdbSignaturesPreserved: true,
  };
}
