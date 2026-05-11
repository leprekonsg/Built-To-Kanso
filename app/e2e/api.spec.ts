import { expect, test } from "@playwright/test";

test.describe("Backend route contracts", () => {
  test("serves validated template geometry", async ({ request }) => {
    const response = await request.get("/api/templates/resale-exec-1990s/geometry");
    expect(response.ok()).toBe(true);

    const geometry = await response.json();
    expect(geometry.schemaVersion).toBe(1);
    expect(geometry.templateId).toBe("resale-exec-1990s");
    expect(geometry.openingAreaPct).toBe(9);
    expect(geometry.fixedElements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "household_shelter", confidence: "black" }),
        expect.objectContaining({ kind: "pipeshaft_opening", confidence: "black", bufferEligible: true }),
      ]),
    );
  });

  test("returns actionable error for unknown template geometry", async ({ request }) => {
    const response = await request.get("/api/templates/not-real/geometry");
    expect(response.status()).toBe(404);

    const body = await response.json();
    expect(body.error).toContain("Use one of:");
  });

  test("blocks non-invasive tokens on Black-state elements", async ({ request }) => {
    const response = await request.post("/api/tokens/validate", {
      data: {
        templateId: "resale-exec-1990s",
        placement: { tokenId: "wood_anchor", point: { x: 13.3, y: 7.4 } },
      },
    });

    expect(response.ok()).toBe(true);
    await expect(response.json()).resolves.toMatchObject({
      allowed: false,
      code: "black_state_blocked",
    });
  });

  test("allows Shaft Buffer within the pipeshaft radius", async ({ request }) => {
    const response = await request.post("/api/tokens/validate", {
      data: {
        templateId: "resale-exec-1990s",
        placement: { tokenId: "shaft_buffer", point: { x: 5.4, y: 3.95 } },
      },
    });

    expect(response.ok()).toBe(true);
    await expect(response.json()).resolves.toMatchObject({
      allowed: true,
      code: "ok",
    });
  });

  test("scout pass caps asking points and returns banded Damp Risk with action", async ({ request }) => {
    const response = await request.post("/api/scout", {
      data: {
        templateId: "resale-exec-1990s",
        compassDeg: 260,
        floor: 11,
        tokenPlacements: [],
      },
    });

    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.askingPoints.length).toBeLessThanOrEqual(3);
    expect(JSON.stringify(body.dampRisk)).not.toContain("predictedRhPct");
    expect(body.dampRisk).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roomId: "main_bedroom",
          band: "high",
          recommendation: expect.stringContaining("Shaft Buffer"),
        }),
      ]),
    );
  });

  test("Shaft Buffer drops the resale master bedroom Damp Risk band to Watch", async ({ request }) => {
    const response = await request.post("/api/scout", {
      data: {
        templateId: "resale-exec-1990s",
        compassDeg: 260,
        floor: 11,
        tokenPlacements: [{ tokenId: "shaft_buffer", point: { x: 5.4, y: 3.95 } }],
      },
    });

    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.dampRisk).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roomId: "main_bedroom",
          band: "watch",
        }),
      ]),
    );
  });

  test("ignores out-of-range Shaft Buffer placements in Scout Pass", async ({ request }) => {
    const response = await request.post("/api/scout", {
      data: {
        templateId: "resale-exec-1990s",
        compassDeg: 260,
        floor: 11,
        tokenPlacements: [{ tokenId: "shaft_buffer", point: { x: 12.2, y: 7.7 } }],
      },
    });

    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.dampRisk).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roomId: "main_bedroom",
          band: "high",
        }),
      ]),
    );
  });

  test("resonance status exposes readiness, Standard thresholds, and push sender status", async ({ request }) => {
    const response = await request.get("/api/resonance/check");
    expect(response.ok()).toBe(true);

    await expect(response.json()).resolves.toMatchObject({
      ready: expect.any(Boolean),
      thresholds: {
        alignmentToleranceDeg: 15,
        minOutdoorSpeedMps: 1.6,
        maxPredictedIndoorSpeedMps: 0.25,
        cooldownHours: 6,
      },
      thresholdsByTier: {
        calm: {
          alignmentToleranceDeg: 10,
          minOutdoorSpeedMps: 1.6,
          maxPredictedIndoorSpeedMps: 0.2,
          cooldownHours: 12,
        },
        active: {
          alignmentToleranceDeg: 20,
          minOutdoorSpeedMps: 1.2,
          maxPredictedIndoorSpeedMps: null,
          cooldownHours: 4,
        },
      },
      status: "not_ready",
      pushDispatch: {
        available: false,
        status: "not_configured",
      },
    });
  });

  test("resonance dispatch route supports dry-run without Web Push credentials", async ({ request }) => {
    const response = await request.post("/api/resonance/dispatch", {
      data: {
        dryRun: true,
        floor: 12,
        wind: {
          directionDeg: 180,
          speedMps: 2,
          timestamp: "2026-05-09T06:00:00Z",
          source: "mock",
        },
        plan: {
          schemaVersion: 1,
          templateId: "tampines-greenweave",
          units: "meters",
          source: "architect_curated_template",
          bounds: { x: 0, y: 0, width: 10, height: 10 },
          openingAreaPct: 14,
          westSunFacadeDeg: 270,
          defaultDoorFacingDeg: 0,
          rooms: [],
          openings: [
            {
              id: "op-north",
              kind: "window",
              roomIds: ["room-a"],
              start: { x: 5, y: 0 },
              end: { x: 5, y: 0 },
              operable: true,
            },
            {
              id: "op-south",
              kind: "window",
              roomIds: ["room-a"],
              start: { x: 5, y: 10 },
              end: { x: 5, y: 10 },
              operable: true,
            },
          ],
          fixedElements: [],
          pipeshaft: {
            id: "shaft-1",
            roomId: "room-a",
            openingPoint: { x: 0, y: 0 },
            openingDirectionDeg: 0,
            jetVelocityMps: [0, 0],
            bufferRadiusM: 0,
            downwindRoomIds: [],
          },
          bathrooms: [],
        },
      },
    });

    expect(response.ok()).toBe(true);
    await expect(response.json()).resolves.toMatchObject({
      dispatch: {
        status: "dry_run",
        attempted: false,
        senderStatus: { status: "not_configured" },
        payload: {
          title: "Resonance Hours",
          body: "Your home is breathing right now.",
          tag: "resonance-hours",
        },
      },
    });
  });

  test("kill-signal feed evaluates Phase 0.5 tester feedback", async ({ request }) => {
    const response = await request.post("/api/validation/kill-signals", {
      data: {
        source: "user_study",
        feedback: [
          { userId: "u1", text: "I mostly remember the render." },
          { userId: "u2", text: "I did not notice the Black-state rule." },
          { userId: "u3", text: "I do not remember bathroom downwind protection." },
          { userId: "u4", text: "The Damp band had a paired action." },
          { userId: "u5", text: "The evidence tier was clear." },
          { userId: "u6", text: "The plan stayed locked." },
          { userId: "u7", text: "The push-disabled note was clear." },
          { userId: "u8", text: "The floor tier copy was clear." },
          { userId: "u9", text: "The Shaft Buffer rule was clear." },
          { userId: "u10", text: "The prototype label was clear." },
        ],
      },
    });

    expect(response.ok()).toBe(true);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      feedbackCount: 10,
      trippedCount: 1,
      nextActions: [
        {
          id: "visual_overpowering_trust_layer",
          action: expect.stringContaining("Reduce visual density"),
        },
      ],
    });
  });

  test("Phase 0 gate feed enforces external evidence thresholds", async ({ request }) => {
    const gateFeed = await request.get("/api/validation/phase0-gates");
    expect(gateFeed.ok()).toBe(true);
    await expect(gateFeed.json()).resolves.toMatchObject({
      totalGateCount: 9,
      gateIds: expect.arrayContaining(["webgpu_redmi_benchmark"]),
      automatedGates: [
        expect.objectContaining({
          id: "template_architecture_verification",
          status: "complete",
        }),
      ],
    });

    const response = await request.post("/api/validation/phase0-gates", {
      data: {
        gateId: "webgpu_redmi_benchmark",
        evidence: {
          device: "Redmi Note 13",
          fpsSamples: [31, 30, 32, 29, 33],
          tier4LookupSamples: [
            { templateId: "resale-exec-1990s", lookupMs: [75, 83] },
            { templateId: "tampines-greenweave", lookupMs: [68, 74] },
            { templateId: "tengah-5room", lookupMs: [72, 79] },
          ],
        },
      },
    });

    expect(response.ok()).toBe(true);
    await expect(response.json()).resolves.toMatchObject({
      gateId: "webgpu_redmi_benchmark",
      passed: true,
      required: expect.stringContaining(">=30fps"),
      observed: expect.stringContaining("median"),
      missing: [],
    });
  });

  test("operational preflight reports demo fallbacks without secrets", async ({ request }) => {
    const response = await request.get("/api/validation/operational-preflight");

    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body).toMatchObject({
      okForDemo: true,
      checks: expect.arrayContaining([
        expect.objectContaining({ id: "openai_tier2_account", status: "external" }),
        expect.objectContaining({ id: "sketch_cache_r2" }),
        expect.objectContaining({ id: "vapid_keypair" }),
      ]),
      requirements: expect.arrayContaining([
        expect.objectContaining({ id: "openai_api_key", sensitive: true }),
        expect.objectContaining({ id: "sketch_cache_r2", sensitive: false }),
      ]),
    });
    expect(JSON.stringify(body)).not.toMatch(/sk-|secret|token/i);
  });

  test("operational preflight accepts non-secret account evidence", async ({ request }) => {
    const response = await request.post("/api/validation/operational-preflight", {
      data: {
        operationalEvidence: {
          openaiTier2Account: {
            verified: true,
            verifiedAtIso: "2026-05-10T00:00:00.000Z",
            reviewer: "demo-operator",
          },
        },
      },
    });

    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "openai_tier2_account", status: "ready" }),
      ]),
    );
    expect(JSON.stringify(body)).not.toContain("demo-operator");
  });

  test("render asset validation audits local/prebaked demo PNGs", async ({ request }) => {
    const response = await request.get("/api/validation/render-assets");

    expect(response.ok()).toBe(true);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      assetCount: 13,
      failedCount: 0,
      assets: expect.arrayContaining([
        expect.objectContaining({ id: "empty-room-0", kind: "empty_room_hero", ok: true }),
        expect.objectContaining({ id: "resale-exec-1990s-plan", kind: "plan_sketch", ok: true }),
        expect.objectContaining({ id: "tengah-5room-life-anchor", kind: "life_anchor", ok: true }),
        expect.objectContaining({ id: "brand-v3-poster-reference", kind: "life_reference", ok: true }),
        expect.objectContaining({ id: "hdb-material-board-reference", kind: "life_reference", ok: true }),
      ]),
    });
  });

  test("Phase 1 readiness report separates repo completion from external blockers", async ({ request }) => {
    const response = await request.get("/api/validation/phase1-readiness");

    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body).toMatchObject({
      complete: false,
      demoReady: true,
      repoImplementationComplete: true,
      implementation: {
        total: 26,
        complete: 26,
      },
      phase0: {
        total: 9,
        pendingExternal: 8,
      },
      renderAssets: {
        ok: true,
      },
      demoBlockers: [],
      blockers: expect.arrayContaining([
        expect.stringContaining("webgpu_redmi_benchmark"),
        expect.stringContaining("openai_tier2_account"),
      ]),
    });
    expect(body.blockers.join(" ")).not.toContain("vapid_keypair");
  });

  test("Phase 1 readiness accepts aggregate Phase 0 evidence", async ({ request }) => {
    const response = await request.post("/api/validation/phase1-readiness", {
      data: {
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
      },
    });

    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.phase0.pendingExternal).toBe(7);
    expect(body.demoReady).toBe(true);
    expect(body.demoBlockers).toEqual([]);
    expect(body.phase0.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "webgpu_redmi_benchmark",
          status: "complete",
          gate: expect.objectContaining({ passed: true }),
        }),
      ]),
    );
    expect(body.complete).toBe(false);
  });

  test("Phase 1 readiness accepts non-secret operational account evidence", async ({ request }) => {
    const response = await request.post("/api/validation/phase1-readiness", {
      data: {
        operationalEvidence: {
          openaiTier2Account: {
            verified: true,
            verifiedAtIso: "2026-05-10T00:00:00.000Z",
            reviewer: "demo-operator",
          },
        },
      },
    });

    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.operational.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "openai_tier2_account",
          status: "ready",
        }),
      ]),
    );
    expect(body.blockers.join(" ")).not.toContain("openai_tier2_account");
    expect(JSON.stringify(body)).not.toContain("demo-operator");
  });
});
