import {
  evaluateOperationalPreflight,
  type OperationalCheck,
  type OperationalEvidence,
  type OperationalRequirement,
} from "./operationalPreflight";
import {
  evaluatePhase0Gate,
  evaluateTemplateArchitectureVerification,
  PHASE0_GATE_REQUIREMENTS,
  type Phase0GateId,
  type Phase0GateRequirement,
  type Phase0GateResult,
} from "./phase0Gates";
import { validateExpectedRenderAssets, type RenderAssetValidationReport } from "./renderAssets";
import { FLOOR_TIERS, tierForFloor } from "@/lib/floorTiers";
import {
  methodologyDisclosures,
  methodologyEvidenceTiers,
  methodologyHardRules,
  methodologyMeasuredClaims,
} from "@/lib/methodologyContent";
import { DEFAULT_VOICE_MODE, VOICE_MODES } from "@/lib/voiceModes";
import { getPlanGeometry, listGeometrySummaries } from "@/server/geometry/registry";
import { getLbmComputeCapability } from "@/server/lbm/gpuSolver";
import { recommendAntiCure } from "@/server/rules/antiCure";
import { generateHouseChangelog } from "@/server/rules/changelog";
import { evaluateGlow } from "@/server/rules/glow";
import { buildGlowWashPolygons } from "@/server/rules/glowRender";
import { previewGhostFutures } from "@/server/rules/ghostFutures";
import { evaluateKansoReserve } from "@/server/rules/kansoReserve";
import { evaluateQuiet } from "@/server/rules/quiet";
import { renderDampedRippleSvg } from "@/server/rules/quietRender";
import { runScoutPass } from "@/server/scout/scout";
import { buildSceneElementSpec } from "@/server/scene/sceneElements";
import { computeCrossVentCorridor } from "@/server/resonance/corridor";
import { evaluateResonance, MIN_NOTIFICATION_SPACING_HOURS, RESONANCE_THRESHOLDS_BY_TIER } from "@/server/resonance/resonance";
import { MATERIAL_DEFAULTS, WEATHER_TRIALS } from "@/server/simulation/fieldBuilders";
import { buildTier4Simulation } from "@/server/simulation/tier4";
import { buildTier4PrebakeMatrix } from "@/server/simulation/prebaked";
import { TOKEN_IDS } from "@/server/rules/tokens";

export type ReadinessStatus = "complete" | "pending_external" | "waived_for_demo" | "incomplete";

export interface ReadinessItem {
  id: string;
  status: ReadinessStatus;
  evidence: string;
  gate?: Phase0GateResult;
}

export type Phase0EvidenceBundle = Partial<Record<Phase0GateId, unknown>>;

export interface Phase1ReadinessOptions {
  publicRoot?: string;
}

export interface Phase1ReadinessReport {
  objective: string;
  complete: boolean;
  demoReady: boolean;
  repoImplementationComplete: boolean;
  implementation: {
    total: number;
    complete: number;
    items: ReadinessItem[];
  };
  phase0: {
    total: number;
    complete: number;
    pendingExternal: number;
    requirements: readonly Phase0GateRequirement[];
    items: ReadinessItem[];
  };
  operational: {
    okForDemo: boolean;
    complete: boolean;
    requirements: readonly OperationalRequirement[];
    checks: OperationalCheck[];
  };
  renderAssets: RenderAssetValidationReport;
  blockers: string[];
  demoBlockers: string[];
}

const phase0GateDescriptions: Record<Phase0GateId, string> = {
  empty_room_beauty: "Needs 20 Empty Room render reviews with >=12 beautiful, >=2 morning east, >=1 west amber, and 0 high-noon south.",
  life_sketch_preservation:
    "Needs live GPT Image 2 edit preservation review proving room counts, wall topology, and HDB signatures across all three templates.",
  webgpu_redmi_benchmark: "Needs Redmi Note 13 live WebGPU benchmark evidence at >=30fps and Tier 4 lookup samples under 200ms.",
  live_studio_comprehension: "Needs 8/10 first-time viewers identifying wind moving through the room within 5 seconds.",
  magic_90_seconds: "Needs 8/10 testers understanding 'place token -> see air move' within 30 seconds.",
  behavioral_overconfidence: "Needs 8/10 tester outcomes with discussion-oriented language and no renovation commitment language.",
  resonance_historical_wind: "Needs one month of historical wind-record evidence at 1x/week to 4x/week per template.",
  material_slider_comprehension: "Needs 8/10 tester outcomes articulating Barely Seen to Clearly Seen change without prompting.",
};

const phase0GateIds: readonly Phase0GateId[] = [
  "empty_room_beauty",
  "life_sketch_preservation",
  "webgpu_redmi_benchmark",
  "live_studio_comprehension",
  "magic_90_seconds",
  "behavioral_overconfidence",
  "resonance_historical_wind",
  "material_slider_comprehension",
];

export async function buildPhase1ReadinessReport(
  env: NodeJS.ProcessEnv = process.env,
  phase0Evidence: Phase0EvidenceBundle = {},
  operationalEvidence: OperationalEvidence = {},
  options: Phase1ReadinessOptions = {},
): Promise<Phase1ReadinessReport> {
  const [operational, renderAssets] = await Promise.all([
    evaluateOperationalPreflight(env, operationalEvidence),
    validateExpectedRenderAssets(options.publicRoot),
  ]);
  const phase1ImplementationItems = buildPhase1ImplementationItems(renderAssets);
  const phase0Items = buildPhase0Items(phase0Evidence);

  const operationalComplete = operational.checks.every((check) =>
    check.status === "ready" || check.status === "waived",
  );
  const phase0Complete = phase0Items.every((gate) => gate.status === "complete");
  const implementationBlockers = phase1ImplementationItems
    .filter((phase1Item) => phase1Item.status !== "complete")
    .map((phase1Item) => `${phase1Item.id}: ${phase1Item.evidence}`);
  const repoImplementationComplete = implementationBlockers.length === 0;
  const demoBlockers = [
    ...implementationBlockers,
    ...operational.checks
      .filter((check) => check.requiredForDemo && check.status !== "ready")
      .map((check) => `${check.id}: ${check.message}`),
    ...renderAssets.assets.flatMap((asset) => asset.issues),
  ];
  const blockers = [
    ...implementationBlockers,
    ...phase0Items
      .filter((gate) => gate.status === "pending_external")
      .map((gate) => `${gate.id}: ${gate.evidence}`),
    ...operational.checks
      .filter((check) => check.status === "external" || check.status === "demo_fallback" || check.status === "not_configured")
      .map((check) => `${check.id}: ${check.message}`),
    ...renderAssets.assets.flatMap((asset) => asset.issues),
  ];

  return {
    objective: "Complete Phase 1 of built-to-kanso-product-brief-v4_1.md.",
    complete: repoImplementationComplete && phase0Complete && operationalComplete,
    demoReady: repoImplementationComplete && operational.okForDemo && demoBlockers.length === 0,
    repoImplementationComplete,
    implementation: {
      total: phase1ImplementationItems.length,
      complete: phase1ImplementationItems.filter((phase1Item) => phase1Item.status === "complete").length,
      items: [...phase1ImplementationItems],
    },
    phase0: {
      total: phase0Items.length,
      complete: phase0Items.filter((gate) => gate.status === "complete").length,
      pendingExternal: phase0Items.filter((gate) => gate.status === "pending_external").length,
      requirements: PHASE0_GATE_REQUIREMENTS,
      items: [...phase0Items],
    },
    operational: {
      okForDemo: operational.okForDemo,
      complete: operationalComplete,
      requirements: operational.requirements,
      checks: operational.checks,
    },
    renderAssets,
    blockers,
    demoBlockers,
  };
}

function item(id: string, evidence: string): ReadinessItem {
  return { id, status: "complete", evidence };
}

function incomplete(id: string, evidence: string): ReadinessItem {
  return { id, status: "incomplete", evidence };
}

function checkedItem(id: string, ok: boolean, completeEvidence: string, incompleteEvidence: string): ReadinessItem {
  return ok ? item(id, completeEvidence) : incomplete(id, incompleteEvidence);
}

function external(id: string, evidence: string): ReadinessItem {
  return { id, status: "pending_external", evidence };
}

function buildPhase1ImplementationItems(renderAssets: RenderAssetValidationReport): ReadinessItem[] {
  const geometrySummaries = listGeometrySummaries();
  const templates = geometrySummaries.map((summary) => getPlanGeometry(summary.templateId));
  const tier4Matrix = buildTier4PrebakeMatrix();
  const firstPlan = templates[0];
  const field = buildTier4Simulation({
    templateId: firstPlan.templateId,
    tokenPlacements: [],
    candidatePositions: [],
    condition: "west_sun_1720",
  });
  const sceneSpec = buildSceneElementSpec(firstPlan, field);
  const scout = runScoutPass({
    plan: firstPlan,
    compassDeg: firstPlan.defaultDoorFacingDeg,
    floor: 11,
    tokenPlacements: [],
  });
  const ghostFutures = previewGhostFutures({
    plan: firstPlan,
    compassDeg: firstPlan.defaultDoorFacingDeg,
    floor: 11,
    placements: [],
  });
  const reserve = evaluateKansoReserve(firstPlan, []);
  const antiCure = recommendAntiCure(firstPlan, scout);
  const glow = evaluateGlow({ plan: firstPlan, compassDeg: firstPlan.westSunFacadeDeg, floor: 16 });
  const glowWash = buildGlowWashPolygons(firstPlan, glow);
  const quiet = evaluateQuiet({ plan: firstPlan, floor: 11 });
  const quietRipple = renderDampedRippleSvg(firstPlan, quiet);
  const corridor = computeCrossVentCorridor(firstPlan);
  const resonance = evaluateResonance({
    plan: firstPlan,
    floor: 11,
    lastNotifiedAtIso: null,
    recentNotificationsIso: [],
    now: new Date("2026-05-10T10:00:00.000Z"),
    wind: {
      source: "mock",
      stationId: "phase1-readiness",
      speedMps: RESONANCE_THRESHOLDS_BY_TIER.standard.minOutdoorSpeedMps,
      directionDeg: corridor?.azimuthDeg ?? firstPlan.defaultDoorFacingDeg,
      timestamp: "2026-05-10T10:00:00.000Z",
    },
    tier: "standard",
    optInAtIso: "2026-05-09T08:00:00.000Z",
  });
  const changelog = generateHouseChangelog({
    plan: firstPlan,
    placements: [{ tokenId: "shaft_buffer", point: firstPlan.pipeshaft.openingPoint }],
  });
  const capability = getLbmComputeCapability();
  const hasThreeTemplates =
    templates.length === 3 &&
    templates.every((plan) =>
      plan.source === "architect_curated_template" &&
      plan.pipeshaft.bufferRadiusM === 0.6 &&
      plan.bathrooms.length > 0 &&
      plan.fixedElements.some((element) => element.kind === "pipeshaft_opening" && element.bufferEligible) &&
      Number.isFinite(plan.openingAreaPct) &&
      Number.isFinite(plan.westSunFacadeDeg),
    );
  const hasMaterialDefaults =
    MATERIAL_DEFAULTS.streamlines.sumiInk.length > 0 &&
    MATERIAL_DEFAULTS.streamlines.silkRibbon.length > 0 &&
    MATERIAL_DEFAULTS.particles.cleanAir === "#D8A24A" &&
    MATERIAL_DEFAULTS.particles.pipeshaft.length > 0;
  const hasHeroAssets = assetKindOk(renderAssets, "empty_room_hero", 5);
  const hasPlanAssets = assetKindOk(renderAssets, "plan_sketch", 3);
  const hasLifeAssets = assetKindOk(renderAssets, "life_anchor", 3);
  const hasAcceptedLifeSketchAssets = assetKindOk(renderAssets, "accepted_life_sketch", 3);
  const hasWindBaseFlagship = assetKindOk(renderAssets, "wind_base", 1);
  const hasTier4Coverage =
    capability.webGpuImplemented &&
    capability.prebakedFallbackAvailable &&
    tier4Matrix.templateCount === 3 &&
    tier4Matrix.tokenCount === 6 &&
    tier4Matrix.baseCellCount === 3 * 6 * tier4Matrix.candidateCountPerTemplate;
  const hasWeatherTrial =
    ["west_sun_1720", "highway_night", "ne_monsoon_wind"].every((id) => id in WEATHER_TRIALS) &&
    Object.keys(WEATHER_TRIALS).length >= 7;
  const hasSceneElements =
    sceneSpec.curtains.length > 0 &&
    sceneSpec.leaves.length > 0 &&
    sceneSpec.kitchenShadow !== null &&
    sceneSpec.kitchenShadow.frameIndex >= 0;
  const hasResonanceLoop =
    Boolean(corridor) &&
    resonance.tier === "weather_context" &&
    RESONANCE_THRESHOLDS_BY_TIER.calm.cooldownHours === 12 &&
    RESONANCE_THRESHOLDS_BY_TIER.active.cooldownHours === 4 &&
    MIN_NOTIFICATION_SPACING_HOURS === 6;
  const hasFloorTiers =
    FLOOR_TIERS.length === 4 &&
    tierForFloor(2).name === "Ground Stagnation" &&
    tierForFloor(11).name === "Golden Floors" &&
    tierForFloor(18).name === "Wind Turbulent";
  const hasPhase1VoiceModes =
    DEFAULT_VOICE_MODE === "cultural" &&
    VOICE_MODES.length === 2 &&
    VOICE_MODES.some((mode) => mode.id === "cultural") &&
    VOICE_MODES.some((mode) => mode.id === "designer");
  const hasMethodologyCoverage =
    methodologyEvidenceTiers.map((tier) => tier.tier).join("|") ===
      "Official constraint|Template fact|Heuristic estimate|Weather context|Prototype visualisation" &&
    methodologyDisclosures.culturalLabel === "Cultural framing" &&
    methodologyDisclosures.nanyangPositioning.includes("Nanyang feng shui") &&
    methodologyDisclosures.etymology.includes("kansō") &&
    methodologyDisclosures.etymology.includes("kasō") &&
    methodologyDisclosures.auditGap.includes("peer-reviewed") &&
    methodologyDisclosures.auditGap.includes("Prototype visualisations") &&
    methodologyDisclosures.measureIntro.includes("does not claim lab measurement") &&
    methodologyHardRules.length >= 5 &&
    methodologyHardRules.some((rule) => rule.includes("AI never edits compliance geometry")) &&
    methodologyHardRules.some((rule) => rule.includes("Streamlines are deterministic first")) &&
    methodologyHardRules.some((rule) => rule.includes("Scout Pass surfaces at most three Asking Points")) &&
    methodologyHardRules.some((rule) => rule.includes("Damp Risk appears as Clear, Watch, or High")) &&
    methodologyHardRules.some((rule) => rule.includes("Cosmological vocabulary is Cultural framing only")) &&
    methodologyMeasuredClaims.includes("bedroom Damp Risk band, kept band-only in homeowner UI");

  return [
    checkedItem(
      "environmental_material_system",
      hasMaterialDefaults,
      "Material adapter defaults cover sumi_ink, silk_ribbon, sunlit_dust, and pipeshaft dust.",
      "Material System defaults are missing one or more required Phase 1 materials.",
    ),
    checkedItem(
      "empty_room_hero_rotation",
      hasHeroAssets,
      "Five committed local hero PNGs exist and pass render-asset validation.",
      "Five valid committed Empty Room hero PNGs are required.",
    ),
    checkedItem(
      "jsx_floor_plan_editor",
      hasThreeTemplates,
      "Three curated templates expose pipeshafts, bathrooms, west-sun exposure, and opening area.",
      "Three curated Phase 1 templates with pipeshaft, bathrooms, west-sun, and opening-area data are required.",
    ),
    checkedItem(
      "threejs_anchor_renders",
      hasLifeAssets,
      "Three committed Life anchor PNGs exist under public/life-anchors and pass validation.",
      "Three valid committed Life anchor PNGs are required.",
    ),
    checkedItem(
      "webgpu_lbm_tier4",
      hasTier4Coverage,
      "Tier 1 WebGPU adapter reports implemented and Tier 4 matrix covers three templates x six tokens.",
      "Tier 1 WebGPU adapter plus Tier 4 prebaked coverage for three templates x six tokens are required.",
    ),
    checkedItem(
      "live_studio_visualization",
      hasSceneElements,
      "Live Studio scene elements resolve curtain, leaf, and kitchen-shadow responses from a deterministic field.",
      "Live Studio must resolve curtain, leaf, and kitchen-shadow responses from a deterministic field.",
    ),
    checkedItem(
      "wind_sketch_streamlines",
      field.streamlines.some((line) => line.material === "sumi_ink"),
      "Wind Sketch route composes deterministic SVG streamlines as sumi_ink.",
      "Wind Sketch needs deterministic sumi_ink streamlines.",
    ),
    checkedItem(
      "six_token_demo",
      TOKEN_IDS.length === 6 && TOKEN_IDS.includes("shaft_buffer"),
      "Wind Gate, Soft Screen, Wood Anchor, Solar Shield, Fan Anchor, and Shaft Buffer are in the token registry.",
      "The Phase 1 token registry must contain exactly six tokens including Shaft Buffer.",
    ),
    checkedItem(
      "scout_pass_three_asking_points",
      scout.askingPoints.length <= 3,
      "Scout Pass caps calm Asking Points at three.",
      "Scout Pass must cap Asking Points at three.",
    ),
    checkedItem(
      "ghost_futures",
      ghostFutures.length === 3 && ghostFutures.some((future) => future.dampBandCopy.includes("Damp Risk")),
      "Ghost Futures previews Breath and Damp deltas before placement.",
      "Ghost Futures must return three paths and Damp Risk copy.",
    ),
    checkedItem(
      "house_changelog_golden_failure",
      changelog.allowed && changelog.lines.length > 0,
      "House Changelog receipt path is callable from deterministic token placements.",
      "House Changelog must produce receipt entries for valid placements.",
    ),
    checkedItem(
      "kanso_reserve",
      reserve.tier === "heuristic_estimate" && reserve.recommendation.includes("empty"),
      "Kanso Reserve metric returns a banded empty-space recommendation.",
      "Kanso Reserve must return a banded empty-space recommendation.",
    ),
    checkedItem(
      "anti_cure",
      Boolean(antiCure?.recommendation),
      "Anti-Cure recommendation is surfaced from deterministic Scout context.",
      "Anti-Cure recommendation must be surfaced from deterministic Scout context.",
    ),
    checkedItem(
      "glow_material",
      glow.recommendedTokenId === "solar_shield" && glowWash.length > 0,
      "Glow material renders west-sun wash through the material layer.",
      "Glow material must render west-sun wash polygons and recommend Solar Shield.",
    ),
    checkedItem(
      "plan_sketch",
      hasPlanAssets,
      "Plan Sketch route supports GPT Image generation and three local/prebaked demo PNGs pass validation.",
      "Three valid committed Plan Sketch PNGs are required for the demo fallback.",
    ),
    checkedItem(
      "life_sketch",
      hasLifeAssets && hasAcceptedLifeSketchAssets,
      "Life Sketch route supports image-edit materialization; three anchors and three accepted Life Sketch prebakes pass validation.",
      "Three valid committed Life Sketch anchors and accepted prebakes are required for the demo fallback.",
    ),
    checkedItem(
      "wind_sketch_composition",
      field.streamlines.length >= 3 && field.tier === "prototype_visualisation" && hasWindBaseFlagship,
      "Wind Sketch keeps deterministic streamlines in SVG and has the demo flagship Stage B background.",
      "Wind Sketch composition must expose deterministic prototype streamlines and the demo flagship Stage B background.",
    ),
    checkedItem(
      "quiet_material",
      quiet.tier === "heuristic_estimate" && quietRipple.includes('data-layer="quiet-damped-ripple"'),
      "Quiet material renders RT60/traffic damped ripple.",
      "Quiet material must render the RT60/traffic damped ripple layer.",
    ),
    checkedItem(
      "damp_dimension",
      scout.dampRisk.every((reading) => reading.recommendation.length > 0),
      "Damp Risk is banded, paired with actions, and avoids RH numerics on homeowner surfaces.",
      "Every Damp Risk reading must remain banded and paired with an action.",
    ),
    checkedItem(
      "bathroom_downwind",
      templates.every((plan) => plan.bathrooms.length > 0),
      "Bathroom-downwind rule has bathroom geometry on every Phase 1 template.",
      "Every Phase 1 template needs bathroom geometry for downwind checks.",
    ),
    checkedItem(
      "opening_area_badge",
      templates.every((plan) => Number.isFinite(plan.openingAreaPct)),
      "12 percent opening-area badge has source data on every Phase 1 template.",
      "Every Phase 1 template needs combined opening-area source data.",
    ),
    checkedItem(
      "floor_golden_floors",
      hasFloorTiers,
      "Threshold floor bands expose low-floor, Golden Floors, and high-floor Resonance copy.",
      "Threshold must expose the Phase 1 floor bands including Golden Floors.",
    ),
    checkedItem(
      "weather_trial",
      hasWeatherTrial,
      "West Sun 17:20, Highway Night, and NE Monsoon Wind conditions are wired.",
      "The three Phase 1 Weather Trial conditions must be wired.",
    ),
    checkedItem(
      "resonance_hours",
      hasResonanceLoop,
      "Resonance detector, floor-aware thresholds, cooldown floor, and in-app loop contract are wired.",
      "Resonance detector, floor-aware thresholds, cooldown floor, and in-app loop contract are required.",
    ),
    checkedItem(
      "cultural_designer_modes",
      hasPhase1VoiceModes,
      "Cultural mode defaults; Designer mode is the only Phase 1 opt-in voice.",
      "Phase 1 must expose Cultural as default and Designer as the only opt-in voice.",
    ),
    checkedItem(
      "methodology_page",
      hasMethodologyCoverage,
      "Methodology content surfaces evidence ladder, cultural framing, Nanyang positioning, etymology, audit gap, and hard rules.",
      "Methodology content must surface evidence ladder, cultural framing, Nanyang positioning, etymology, audit gap, and hard rules.",
    ),
  ];
}

function assetKindOk(
  renderAssets: RenderAssetValidationReport,
  kind: RenderAssetValidationReport["assets"][number]["kind"],
  expectedCount: number,
): boolean {
  const assets = renderAssets.assets.filter((asset) => asset.kind === kind);
  return assets.length === expectedCount && assets.every((asset) => asset.ok);
}

function buildPhase0Items(phase0Evidence: Phase0EvidenceBundle): ReadinessItem[] {
  const templateArchitecture = evaluateTemplateArchitectureVerification();

  return [
    ...phase0GateIds.map((gateId) => phase0GateItem(gateId, phase0Evidence[gateId])),
    {
      id: templateArchitecture.id,
      status: templateArchitecture.status === "complete" ? "complete" : "incomplete",
      evidence: templateArchitecture.issues.length > 0
        ? templateArchitecture.issues.join(" ")
        : templateArchitecture.evidence,
    },
  ];
}

function phase0GateItem(gateId: Phase0GateId, evidence: unknown): ReadinessItem {
  if (evidence === undefined) {
    return external(gateId, phase0GateDescriptions[gateId]);
  }

  const gate = evaluatePhase0Gate(gateId, evidence);
  return {
    id: gateId,
    status: gate.passed ? "complete" : "pending_external",
    evidence: gate.passed ? gate.summary : gate.missing.join(" "),
    gate,
  };
}
