import {
  evaluateOperationalPreflight,
  type OperationalCheck,
  type OperationalEvidence,
  type OperationalRequirement,
} from "./operationalPreflight";
import {
  evaluatePhase0Gate,
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
import { getPlanGeometry, getGeometryReleaseGate } from "@/server/geometry/registry";
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
import type { TemplateId } from "@/server/geometry/types";
import type { PlanGeometry } from "@/server/geometry/types";
import {
  PHASE1_RELEASE_MANIFEST,
  type ReleaseCapability,
  type ReleaseManifest,
  type ReleaseOutput,
} from "@/server/geometry/releaseManifest";

export { PHASE1_RELEASE_MANIFEST } from "@/server/geometry/releaseManifest";
export type { ReleaseCapability, ReleaseManifest, ReleaseOutput } from "@/server/geometry/releaseManifest";

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
  releaseManifest?: ReleaseManifest;
  gateForTemplate?: typeof getGeometryReleaseGate;
  planForTemplate?: typeof getPlanGeometry;
}

export interface Phase1ReadinessReport {
  releaseManifest: ReleaseManifest;
  geometry: Array<{ templateId: string; releaseGate: ReturnType<typeof getGeometryReleaseGate> }>;
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

const capabilityGateKey: Record<ReleaseCapability, keyof ReturnType<typeof getGeometryReleaseGate>["capabilities"]> = {
  layout_display: "layoutDisplay",
  placement_advice: "placementAdvice",
  illustrative_airflow: "illustrativeAirflow",
  home_weather_alignment: "homeWeatherAlignment",
};

export function releaseGeometryBlockers(
  manifest: ReleaseManifest,
  gateForTemplate: (templateId: TemplateId) => ReturnType<typeof getGeometryReleaseGate>,
): string[] {
  return manifest.entries.flatMap((entry) => {
    const gate = gateForTemplate(entry.templateId);
    if (!gate.eligible) {
      return [`geometry_review:${entry.templateId}: source-backed geometry review is incomplete or stale.`];
    }
    return entry.capabilities.flatMap((capability) => {
      const result = gate.capabilities[capabilityGateKey[capability]];
      return result.available
        ? []
        : [`geometry_capability:${entry.templateId}:${capability}: ${result.reason ?? "Capability prerequisites are incomplete."}`];
    });
  });
}

export function releaseManifestIssues(manifest: ReleaseManifest): string[] {
  const issues: string[] = [];
  if (!manifest.id.trim()) issues.push("release_manifest: id is required.");
  if (manifest.entries.length === 0) issues.push("release_manifest: select at least one template.");
  const seen = new Set<string>();
  for (const entry of manifest.entries) {
    if (seen.has(entry.templateId)) issues.push(`release_manifest:${entry.templateId}: duplicate template entry.`);
    seen.add(entry.templateId);
    if (entry.capabilities.length === 0) issues.push(`release_manifest:${entry.templateId}: select at least one capability.`);
    if (new Set(entry.capabilities).size !== entry.capabilities.length) {
      issues.push(`release_manifest:${entry.templateId}: capability names must be unique.`);
    }
    if (new Set(entry.outputs).size !== entry.outputs.length) {
      issues.push(`release_manifest:${entry.templateId}: output names must be unique.`);
    }
    const capabilities = new Set(entry.capabilities);
    const needs = (output: ReleaseOutput, capability: ReleaseCapability) => {
      if (entry.outputs.includes(output) && !capabilities.has(capability)) {
        issues.push(`release_manifest:${entry.templateId}:${output}: requires ${capability}.`);
      }
    };
    needs("plan_svg", "layout_display");
    needs("plan_sketch", "layout_display");
    needs("life_sketch", "layout_display");
    needs("wind_sketch", "illustrative_airflow");
    needs("resonance_hour", "home_weather_alignment");
  }
  return issues;
}

const phase0GateDescriptions: Record<Phase0GateId, string> = {
  empty_room_beauty: "Needs 20 Empty Room render reviews with >=12 beautiful, >=2 morning east, >=1 west amber, and 0 high-noon south.",
  life_sketch_preservation:
    "Needs live GPT Image 2 edit preservation review proving room counts, wall topology, and HDB signatures for every selected Life Sketch template.",
  webgpu_redmi_benchmark: "Needs Redmi Note 13 live WebGPU benchmark evidence at >=30fps and selected-template Tier 4 lookup samples under 200ms.",
  live_studio_comprehension: "Needs 8/10 first-time viewers identifying wind moving through the room within 5 seconds.",
  magic_90_seconds: "Needs 8/10 testers understanding 'place token -> see air move' within 30 seconds.",
  behavioral_overconfidence: "Needs 8/10 tester outcomes with discussion-oriented language and no renovation commitment language.",
  resonance_historical_wind: "Needs one month of historical wind-record evidence at 1x/week to 4x/week per selected weather-alignment template.",
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
  const releaseManifest = options.releaseManifest ?? PHASE1_RELEASE_MANIFEST;
  const gateForTemplate = options.gateForTemplate ?? ((templateId) => getGeometryReleaseGate(templateId, releaseManifest));
  const planForTemplate = options.planForTemplate ?? getPlanGeometry;
  const [operational, renderAssets] = await Promise.all([
    evaluateOperationalPreflight(env, operationalEvidence),
    validateExpectedRenderAssets(options.publicRoot),
  ]);
  const phase1ImplementationItems = buildPhase1ImplementationItems(renderAssets, releaseManifest, planForTemplate);
  const phase0Items = buildPhase0Items(phase0Evidence, releaseManifest);
  const manifestBlockers = releaseManifestIssues(releaseManifest);
  const geometry = releaseManifest.entries.map(({ templateId }) => ({ templateId, releaseGate: gateForTemplate(templateId) }));
  const geometryBlockers = manifestBlockers.length === 0 ? releaseGeometryBlockers(releaseManifest, gateForTemplate) : [];
  const requiredOperationalIds = operationalCheckIdsForRelease(releaseManifest);
  const scopedOperationalChecks = operational.checks.filter((check) => requiredOperationalIds.has(check.id));
  const scopedOperationalRequirements = operational.requirements.filter((requirement) => requiredOperationalIds.has(requirement.id));

  const operationalComplete = scopedOperationalChecks.every((check) =>
    check.status === "ready" || check.status === "waived",
  );
  const phase0Complete = phase0Items.every((gate) => gate.status === "complete");
  const implementationBlockers = phase1ImplementationItems
    .filter((phase1Item) => phase1Item.status !== "complete")
    .map((phase1Item) => `${phase1Item.id}: ${phase1Item.evidence}`);
  const repoImplementationComplete = implementationBlockers.length === 0;
  const releaseAssetIssues = [
    ...releaseAssetCoverageIssues(releaseManifest, renderAssets),
    ...renderAssets.assets
      .filter((asset) => releaseRequiresAsset(releaseManifest, asset))
      .flatMap((asset) => asset.issues),
  ];
  const demoBlockers = [
    ...geometryBlockers,
    ...manifestBlockers,
    ...implementationBlockers,
    ...scopedOperationalChecks
      .filter((check) => check.requiredForDemo && check.status !== "ready")
      .map((check) => `${check.id}: ${check.message}`),
    ...releaseAssetIssues,
  ];
  const blockers = [
    ...geometryBlockers,
    ...manifestBlockers,
    ...implementationBlockers,
    ...phase0Items
      .filter((gate) => gate.status === "pending_external")
      .map((gate) => `${gate.id}: ${gate.evidence}`),
    ...scopedOperationalChecks
      .filter((check) => check.status === "external" || check.status === "demo_fallback" || check.status === "not_configured")
      .map((check) => `${check.id}: ${check.message}`),
    ...releaseAssetIssues,
  ];

  return {
    releaseManifest,
    geometry,
    objective: `Release ${releaseManifest.id} only for its selected templates, capabilities, and outputs.`,
    complete: manifestBlockers.length === 0 && geometryBlockers.length === 0 && releaseAssetIssues.length === 0 && repoImplementationComplete && phase0Complete && operationalComplete,
    demoReady: manifestBlockers.length === 0 && repoImplementationComplete && demoBlockers.length === 0,
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
      requirements: PHASE0_GATE_REQUIREMENTS.filter((requirement) => phase0Items.some((phase0Item) => phase0Item.id === requirement.gateId)),
      items: [...phase0Items],
    },
    operational: {
      okForDemo: scopedOperationalChecks.every((check) => !check.requiredForDemo || check.status === "ready"),
      complete: operationalComplete,
      requirements: scopedOperationalRequirements,
      checks: scopedOperationalChecks,
    },
    renderAssets,
    blockers,
    demoBlockers,
  };
}

function releaseRequiresAsset(
  manifest: ReleaseManifest,
  asset: RenderAssetValidationReport["assets"][number],
): boolean {
  if (!asset.templateId) return false;
  const entry = manifest.entries.find(({ templateId }) => templateId === asset.templateId);
  if (!entry) return false;
  return (
    (asset.kind === "plan_sketch" && entry.outputs.includes("plan_sketch")) ||
    (asset.kind === "life_anchor" && entry.outputs.includes("life_sketch")) ||
    (asset.kind === "accepted_life_sketch" && entry.outputs.includes("life_sketch")) ||
    (asset.kind === "wind_base" && entry.outputs.includes("wind_sketch")) ||
    (asset.kind === "resonance_hour" && entry.outputs.includes("resonance_hour"))
  );
}

function releaseAssetCoverageIssues(
  manifest: ReleaseManifest,
  renderAssets: RenderAssetValidationReport,
): string[] {
  const kindsByOutput: Partial<Record<ReleaseOutput, RenderAssetValidationReport["assets"][number]["kind"][]>> = {
    plan_sketch: ["plan_sketch"],
    life_sketch: ["life_anchor", "accepted_life_sketch"],
    wind_sketch: ["wind_base"],
    resonance_hour: ["resonance_hour"],
  };
  return manifest.entries.flatMap((entry) => entry.outputs.flatMap((output) =>
    (kindsByOutput[output] ?? []).flatMap((kind) =>
      renderAssets.assets.some((asset) => asset.templateId === entry.templateId && asset.kind === kind)
        ? []
        : [`release_asset:${entry.templateId}:${output}: no ${kind} artifact is registered for validation.`],
    ),
  ));
}

function operationalCheckIdsForRelease(manifest: ReleaseManifest): Set<OperationalCheck["id"]> {
  const outputs = new Set(manifest.entries.flatMap((entry) => entry.outputs));
  const capabilities = new Set(manifest.entries.flatMap((entry) => entry.capabilities));
  const ids = new Set<OperationalCheck["id"]>();
  if (["plan_sketch", "life_sketch", "wind_sketch", "resonance_hour"].some((output) => outputs.has(output as ReleaseOutput))) {
    ids.add("openai_tier2_account");
    ids.add("openai_api_key");
    ids.add("sketch_cache_r2");
  }
  if (capabilities.has("home_weather_alignment")) ids.add("nea_api_key");
  return ids;
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

function buildPhase1ImplementationItems(
  renderAssets: RenderAssetValidationReport,
  releaseManifest: ReleaseManifest,
  planForTemplate: (templateId: TemplateId) => PlanGeometry,
): ReadinessItem[] {
  const selectedTemplateIds = new Set(releaseManifest.entries.map((entry) => entry.templateId));
  const templates = releaseManifest.entries.map((entry) => planForTemplate(entry.templateId));
  const hasSelectedTemplates =
    templates.length === selectedTemplateIds.size &&
    templates.length > 0 &&
    templates.every((plan) => plan.source === "architect_curated_template" && Number.isFinite(plan.openingAreaPct));
  const requiredIds = requiredImplementationItemIds(releaseManifest);
  if ([...requiredIds].every((id) => id === "jsx_floor_plan_editor" || id === "methodology_page")) {
    return [
      checkedItem(
        "jsx_floor_plan_editor",
        hasSelectedTemplates,
        "Every template selected by the release manifest has usable layout data; shaft data is optional.",
        "Every template selected by the release manifest must have usable layout data.",
      ),
      checkedItem(
        "methodology_page",
        methodologyCoverageReady(),
        "Methodology content surfaces evidence ladder, cultural framing, Nanyang positioning, etymology, audit gap, and hard rules.",
        "Methodology content must surface evidence ladder, cultural framing, Nanyang positioning, etymology, audit gap, and hard rules.",
      ),
    ];
  }
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
    placements: firstPlan.pipeshaft ? [{ tokenId: "shaft_buffer", point: firstPlan.pipeshaft.openingPoint }] : [],
  });
  const capability = getLbmComputeCapability();
  const hasMaterialDefaults =
    MATERIAL_DEFAULTS.streamlines.sumiInk.length > 0 &&
    MATERIAL_DEFAULTS.streamlines.silkRibbon.length > 0 &&
    MATERIAL_DEFAULTS.particles.cleanAir === "#D8A24A" &&
    MATERIAL_DEFAULTS.particles.pipeshaft.length > 0;
  const hasHeroAssets = assetKindOk(renderAssets, "empty_room_hero", 5);
  const hasPlanAssets = selectedAssetKindOk(renderAssets, "plan_sketch", selectedTemplateIds);
  const hasLifeAssets = selectedAssetKindOk(renderAssets, "life_anchor", selectedTemplateIds);
  const hasAcceptedLifeSketchAssets = selectedAssetKindOk(renderAssets, "accepted_life_sketch", selectedTemplateIds);
  const hasWindBaseFlagship = assetKindOk(renderAssets, "wind_base", 1);
  const hasTier4Coverage =
    capability.webGpuImplemented &&
    capability.prebakedFallbackAvailable &&
    [...selectedTemplateIds].every((templateId) => tier4Matrix.entries.some((entry) => entry.templateId === templateId)) &&
    tier4Matrix.entries.filter((entry) => selectedTemplateIds.has(entry.templateId)).length ===
      selectedTemplateIds.size * tier4Matrix.tokenCount * tier4Matrix.candidateCountPerTemplate;
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
  const hasMethodologyCoverage = methodologyCoverageReady();

  const allItems = [
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
      hasSelectedTemplates,
      "Every template selected by the release manifest has usable layout data; shaft data is optional.",
      "Every template selected by the release manifest must have usable layout data.",
    ),
    checkedItem(
      "threejs_anchor_renders",
      hasLifeAssets,
      "Selected-template Life anchor PNGs exist and pass validation.",
      "Valid Life anchor PNGs are required for every selected Life Sketch template.",
    ),
    checkedItem(
      "webgpu_lbm_tier4",
      hasTier4Coverage,
      "Tier 1 WebGPU adapter reports implemented and Tier 4 covers every selected illustrative-airflow template.",
      "Tier 1 WebGPU plus selected-template Tier 4 prebaked coverage are required.",
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
      ghostFutures.length === 3 && ghostFutures.every((future) => future.dampBandCopy.includes("Not assessed")),
      "Ghost Futures returns three illustrative paths and withholds unmeasured humidity outcomes.",
      "Ghost Futures must return three paths with honest humidity evidence status.",
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
      "A valid committed Plan Sketch PNG is required for every selected Plan Sketch template.",
    ),
    checkedItem(
      "life_sketch",
      hasLifeAssets && hasAcceptedLifeSketchAssets,
      "Life Sketch route supports image-edit materialization; three anchors and three accepted Life Sketch prebakes pass validation.",
      "Valid committed anchors and accepted prebakes are required for every selected Life Sketch template.",
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
      scout.dampRisk.every((reading) => reading.band === "not_assessed" && reading.recommendation.includes("Not assessed")),
      "Unmeasured bedroom humidity outcomes return Not assessed without RH numerics.",
      "Every unmeasured bedroom humidity outcome must return Not assessed.",
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

  return allItems.filter(({ id }) => requiredIds.has(id));
}

function methodologyCoverageReady(): boolean {
  return (
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
    methodologyHardRules.some((rule) => rule.includes("Humidity remains Not assessed")) &&
    methodologyHardRules.some((rule) => rule.includes("Cosmological vocabulary is Cultural framing only")) &&
    methodologyMeasuredClaims.includes("bedroom humidity evidence status, with unmeasured outcomes shown as Not assessed")
  );
}

function requiredImplementationItemIds(manifest: ReleaseManifest): Set<string> {
  const capabilities = new Set(manifest.entries.flatMap((entry) => entry.capabilities));
  const outputs = new Set(manifest.entries.flatMap((entry) => entry.outputs));
  const ids = new Set(["jsx_floor_plan_editor", "methodology_page"]);

  if (capabilities.has("placement_advice")) {
    ["six_token_demo", "scout_pass_three_asking_points", "house_changelog_golden_failure", "kanso_reserve", "anti_cure"]
      .forEach((id) => ids.add(id));
  }
  if (capabilities.has("illustrative_airflow")) {
    ["environmental_material_system", "webgpu_lbm_tier4", "live_studio_visualization", "wind_sketch_streamlines"]
      .forEach((id) => ids.add(id));
  }
  if (capabilities.has("home_weather_alignment")) {
    ["bathroom_downwind", "opening_area_badge", "floor_golden_floors", "weather_trial", "resonance_hours"]
      .forEach((id) => ids.add(id));
  }
  if (outputs.has("plan_sketch")) ids.add("plan_sketch");
  if (outputs.has("life_sketch")) {
    ids.add("threejs_anchor_renders");
    ids.add("life_sketch");
  }
  if (outputs.has("wind_sketch")) ids.add("wind_sketch_composition");
  if (outputs.has("resonance_hour")) ids.add("resonance_hours");

  return ids;
}

function assetKindOk(
  renderAssets: RenderAssetValidationReport,
  kind: RenderAssetValidationReport["assets"][number]["kind"],
  expectedCount: number,
): boolean {
  const assets = renderAssets.assets.filter((asset) => asset.kind === kind);
  return assets.length === expectedCount && assets.every((asset) => asset.ok);
}

function selectedAssetKindOk(
  renderAssets: RenderAssetValidationReport,
  kind: RenderAssetValidationReport["assets"][number]["kind"],
  selectedTemplateIds: ReadonlySet<string>,
): boolean {
  const assets = renderAssets.assets.filter(
    (asset) => asset.kind === kind && asset.templateId && selectedTemplateIds.has(asset.templateId),
  );
  return assets.length === selectedTemplateIds.size && assets.every((asset) => asset.ok);
}

function buildPhase0Items(phase0Evidence: Phase0EvidenceBundle, manifest: ReleaseManifest): ReadinessItem[] {
  const capabilities = new Set(manifest.entries.flatMap((entry) => entry.capabilities));
  const outputs = new Set(manifest.entries.flatMap((entry) => entry.outputs));
  const required = new Set<Phase0GateId>();
  if (outputs.has("life_sketch")) required.add("life_sketch_preservation");
  if (["plan_sketch", "life_sketch", "wind_sketch", "resonance_hour"].some((output) => outputs.has(output as ReleaseOutput))) {
    required.add("empty_room_beauty");
  }
  if (capabilities.has("illustrative_airflow")) {
    ["webgpu_redmi_benchmark", "live_studio_comprehension", "magic_90_seconds", "material_slider_comprehension"]
      .forEach((gateId) => required.add(gateId as Phase0GateId));
  }
  if (capabilities.has("placement_advice")) required.add("behavioral_overconfidence");
  if (capabilities.has("home_weather_alignment")) required.add("resonance_historical_wind");

  return phase0GateIds
    .filter((gateId) => required.has(gateId))
    .map((gateId) => phase0GateItem(gateId, phase0Evidence[gateId], manifest.entries.map((entry) => entry.templateId)));
}

function phase0GateItem(gateId: Phase0GateId, evidence: unknown, templateIds: readonly TemplateId[]): ReadinessItem {
  if (evidence === undefined) {
    return external(gateId, phase0GateDescriptions[gateId]);
  }

  const gate = evaluatePhase0Gate(gateId, evidence, templateIds);
  return {
    id: gateId,
    status: gate.passed ? "complete" : "pending_external",
    evidence: gate.passed ? gate.summary : gate.missing.join(" "),
    gate,
  };
}
