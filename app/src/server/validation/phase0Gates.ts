import { getPlanGeometry, isTemplateId, listGeometrySummaries } from "@/server/geometry/registry";
import type { TemplateId } from "@/server/geometry/types";
import { buildSceneElementSpec } from "@/server/scene/sceneElements";
import { buildTier4Simulation } from "@/server/simulation/tier4";

export type Phase0GateId =
  | "empty_room_beauty"
  | "life_sketch_preservation"
  | "webgpu_redmi_benchmark"
  | "live_studio_comprehension"
  | "magic_90_seconds"
  | "behavioral_overconfidence"
  | "resonance_historical_wind"
  | "material_slider_comprehension";

export interface Phase0GateResult {
  gateId: Phase0GateId;
  passed: boolean;
  summary: string;
  required: string;
  observed: string;
  missing: string[];
}

export interface Phase0GateRequirement {
  gateId: Phase0GateId;
  evidenceKey: string;
  required: string;
  example: unknown;
}

export interface AutomatedPhase0GateResult {
  id: "template_architecture_verification";
  status: "complete" | "incomplete";
  evidence: string;
  issues: string[];
}

const PHASE1_TEMPLATE_IDS: readonly TemplateId[] = [
  "resale-exec-1990s",
  "tampines-greenweave",
  "tengah-5room",
];

export const PHASE0_GATE_REQUIREMENTS: readonly Phase0GateRequirement[] = [
  {
    gateId: "empty_room_beauty",
    evidenceKey: "renderOutcomes",
    required: "20 Empty Room render reviews with beauty and tropical-light outcomes.",
    example: {
      renderOutcomes: [
        {
          renderId: "empty-room-01",
          beautiful: true,
          morningEastLight: true,
          eveningWestAmber: false,
          highNoonSouthDominant: false,
        },
      ],
    },
  },
  {
    gateId: "life_sketch_preservation",
    evidenceKey: "templateOutcomes",
    required: "One preservation outcome for each template selected for Life Sketch output.",
    example: {
      templateOutcomes: [
        {
          templateId: "resale-exec-1990s",
          roomCountsPreserved: true,
          wallTopologyPreserved: true,
          hdbSignaturesPreserved: true,
        },
      ],
    },
  },
  {
    gateId: "webgpu_redmi_benchmark",
    evidenceKey: "fpsSamples + tier4LookupSamples",
    required: "Redmi Note 13 FPS samples plus Tier 4 lookup samples for each selected illustrative-airflow template.",
    example: {
      device: "Redmi Note 13",
      fpsSamples: [31, 30, 32],
      tier4LookupSamples: [
        { templateId: "resale-exec-1990s", lookupMs: [75, 83] },
      ],
    },
  },
  {
    gateId: "live_studio_comprehension",
    evidenceKey: "testerOutcomes",
    required: "10 first-time viewer outcomes; at least 8 identify wind within 5 seconds.",
    example: {
      testerOutcomes: [
        { testerId: "viewer-01", identifiedWindMoving: true, identifiedWithinSeconds: 5 },
      ],
    },
  },
  {
    gateId: "magic_90_seconds",
    evidenceKey: "testerOutcomes",
    required: "10 tester outcomes; at least 8 understand token-to-air causality within 30 seconds.",
    example: {
      testerOutcomes: [
        { testerId: "tester-01", understoodTokenChangesAir: true, understoodWithinSeconds: 30 },
      ],
    },
  },
  {
    gateId: "behavioral_overconfidence",
    evidenceKey: "testerOutcomes",
    required: "10 tester language outcomes; at least 8 discussion-oriented and not commitment language.",
    example: {
      testerOutcomes: [
        { testerId: "tester-01", discussionOrientedLanguage: true, commitmentLanguage: false },
      ],
    },
  },
  {
    gateId: "resonance_historical_wind",
    evidenceKey: "templateWeeks",
    required: "Four weekly historical fire counts for each selected weather-alignment template, each between 1 and 4.",
    example: {
      templateWeeks: [
        { templateId: "resale-exec-1990s", weeklyFires: [1, 2, 3, 4] },
      ],
    },
  },
  {
    gateId: "material_slider_comprehension",
    evidenceKey: "testerOutcomes",
    required: "10 tester outcomes; at least 8 articulate the slider change without prompting.",
    example: {
      testerOutcomes: [
        { testerId: "tester-01", articulatedChange: true, withoutPrompting: true },
      ],
    },
  },
];

export function evaluateTemplateArchitectureVerification(): AutomatedPhase0GateResult {
  const templates = listGeometrySummaries().map((summary) => getPlanGeometry(summary.templateId));
  const issues = templates.flatMap((plan) => {
    const field = buildTier4Simulation({
      templateId: plan.templateId,
      tokenPlacements: [],
      candidatePositions: [],
      condition: "west_sun_1720",
    });
    const sceneSpec = buildSceneElementSpec(plan, field);
    const planIssues: string[] = [];

    if (!plan.fixedElements.some((element) => element.kind === "pipeshaft_opening" && element.bufferEligible)) {
      planIssues.push(`${plan.templateId}: missing buffer-eligible pipeshaft opening.`);
    }
    if (plan.pipeshaft && plan.pipeshaft.bufferRadiusM !== 0.6) {
      planIssues.push(`${plan.templateId}: Shaft Buffer radius must be 0.6m.`);
    }
    if (!sceneSpec.kitchenShadow || sceneSpec.kitchenShadow.bounds.width <= 0 || sceneSpec.kitchenShadow.bounds.height <= 0) {
      planIssues.push(`${plan.templateId}: missing kitchen-partition shadow surface.`);
    }

    return planIssues;
  });

  if (templates.length !== PHASE1_TEMPLATE_IDS.length) {
    issues.push(`Expected ${PHASE1_TEMPLATE_IDS.length} Phase 1 templates; found ${templates.length}.`);
  }

  return {
    id: "template_architecture_verification",
    status: issues.length === 0 ? "complete" : "incomplete",
    evidence:
      issues.length === 0
        ? "Automated coverage verifies every Phase 1 template supports kitchen shadow and Shaft Buffer mechanics."
        : "Every Phase 1 template must support kitchen shadow and Shaft Buffer mechanics.",
    issues,
  };
}

export function evaluatePhase0Gate(
  gateId: Phase0GateId,
  evidence: unknown,
  templateIds: readonly TemplateId[] = PHASE1_TEMPLATE_IDS,
): Phase0GateResult {
  switch (gateId) {
    case "empty_room_beauty":
      return emptyRoomGate(evidence);
    case "live_studio_comprehension":
      return liveStudioGate(evidence);
    case "magic_90_seconds":
      return magicGate(evidence);
    case "behavioral_overconfidence":
      return behavioralGate(evidence);
    case "material_slider_comprehension":
      return materialSliderGate(evidence);
    case "life_sketch_preservation":
      return lifeSketchGate(evidence, templateIds);
    case "webgpu_redmi_benchmark":
      return webGpuGate(evidence, templateIds);
    case "resonance_historical_wind":
      return resonanceGate(evidence, templateIds);
  }
}

function emptyRoomGate(evidence: unknown): Phase0GateResult {
  const required =
    "20 Empty Room render reviews: >=12 beautiful, >=2 morning east-light scenes, >=1 evening west-amber scene, and 0 high-noon south-dominant scenes.";
  const outcomes = readArray(evidence, "renderOutcomes");
  if (typeof outcomes === "string") return pending("empty_room_beauty", required, outcomes);

  const total = outcomes.length;
  const beautiful = outcomes.filter((entry) => readBoolean(entry, "beautiful") === true).length;
  const morningEast = outcomes.filter((entry) => readBoolean(entry, "morningEastLight") === true).length;
  const eveningWestAmber = outcomes.filter((entry) => readBoolean(entry, "eveningWestAmber") === true).length;
  const highNoonSouthDominant = outcomes.filter((entry) => readBoolean(entry, "highNoonSouthDominant") === true).length;

  const missing: string[] = [];
  if (total < 20) missing.push(`Need ${20 - total} more Empty Room render reviews.`);
  if (beautiful < 12) missing.push(`Need ${12 - beautiful} more beautiful Empty Room outcomes.`);
  if (morningEast < 2) missing.push(`Need ${2 - morningEast} more morning east-light scenes.`);
  if (eveningWestAmber < 1) missing.push("Need 1 evening west-amber scene.");
  if (highNoonSouthDominant > 0) {
    missing.push("High-noon south-dominant scenes are rejected regardless of aesthetic quality.");
  }

  return {
    gateId: "empty_room_beauty",
    passed: missing.length === 0,
    summary: `${beautiful}/${total} beautiful; morning east ${morningEast}; west amber ${eveningWestAmber}; high-noon south ${highNoonSouthDominant}.`,
    required,
    observed: `${beautiful}/${total} beautiful, ${morningEast} morning-east, ${eveningWestAmber} west-amber, ${highNoonSouthDominant} high-noon-south`,
    missing,
  };
}

function liveStudioGate(evidence: unknown): Phase0GateResult {
  return testerGate(
    "live_studio_comprehension",
    evidence,
    "8 of 10 first-time viewers identify wind moving through the room within 5 seconds.",
    (entry) => readBoolean(entry, "identifiedWindMoving") === true && readNumber(entry, "identifiedWithinSeconds") <= 5,
    "identifying wind within 5 seconds",
  );
}

function magicGate(evidence: unknown): Phase0GateResult {
  return testerGate(
    "magic_90_seconds",
    evidence,
    "8 of 10 testers understand 'place token -> see air move' within 30 seconds.",
    (entry) => readBoolean(entry, "understoodTokenChangesAir") === true && readNumber(entry, "understoodWithinSeconds") <= 30,
    "understanding token-to-air causality within 30 seconds",
  );
}

function behavioralGate(evidence: unknown): Phase0GateResult {
  return testerGate(
    "behavioral_overconfidence",
    evidence,
    "8 of 10 testers use discussion-oriented language rather than renovation commitment language.",
    (entry) => readBoolean(entry, "discussionOrientedLanguage") === true && readBoolean(entry, "commitmentLanguage") !== true,
    "using discussion-oriented language without commitment language",
  );
}

function materialSliderGate(evidence: unknown): Phase0GateResult {
  return testerGate(
    "material_slider_comprehension",
    evidence,
    "8 of 10 testers articulate the Barely Seen to Clearly Seen change without prompting.",
    (entry) => readBoolean(entry, "articulatedChange") === true && readBoolean(entry, "withoutPrompting") === true,
    "articulating the slider change without prompting",
  );
}

function testerGate(
  gateId: Phase0GateId,
  evidence: unknown,
  required: string,
  isPassingOutcome: (entry: unknown) => boolean,
  passLabel: string,
): Phase0GateResult {
  const outcomes = readArray(evidence, "testerOutcomes");
  if (typeof outcomes === "string") {
    return pending(gateId, required, outcomes);
  }

  const passes = outcomes.filter(isPassingOutcome).length;
  const total = outcomes.length;
  const missing: string[] = [];
  if (total < 10) missing.push(`Need ${10 - total} more tester outcomes.`);
  if (passes < 8) missing.push(`Need ${8 - passes} more tester outcomes ${passLabel}.`);

  return {
    gateId,
    passed: missing.length === 0,
    summary: `${passes}/${total} tester outcomes passed: ${passLabel}.`,
    required,
    observed: `${passes}/${total}`,
    missing,
  };
}

function lifeSketchGate(evidence: unknown, templateIds: readonly TemplateId[]): Phase0GateResult {
  const outcomes = readArray(evidence, "templateOutcomes");
  const required = "Every template selected for Life Sketch output preserves room counts, wall topology, and HDB layout signatures after GPT Image edit.";
  if (typeof outcomes === "string") return pending("life_sketch_preservation", required, outcomes);

  const byTemplate = new Map<string, { roomCounts: boolean; wallTopology: boolean; hdbSignatures: boolean }>();
  for (const entry of outcomes) {
    const templateId = readString(entry, "templateId");
    if (templateId && isTemplateId(templateId)) {
      byTemplate.set(templateId, {
        roomCounts: readBoolean(entry, "roomCountsPreserved") === true,
        wallTopology: readBoolean(entry, "wallTopologyPreserved") === true,
        hdbSignatures: readBoolean(entry, "hdbSignaturesPreserved") === true,
      });
    }
  }
  const missing: string[] = [];
  for (const templateId of templateIds) {
    const result = byTemplate.get(templateId);
    if (!result) {
      missing.push(`Missing GPT Image edit preservation evidence for ${templateId}.`);
      continue;
    }
    if (!result.roomCounts) missing.push(`${templateId}: roomCountsPreserved must be true.`);
    if (!result.wallTopology) missing.push(`${templateId}: wallTopologyPreserved must be true.`);
    if (!result.hdbSignatures) missing.push(`${templateId}: hdbSignaturesPreserved must be true.`);
  }

  return {
    gateId: "life_sketch_preservation",
    passed: missing.length === 0,
    summary: `${templateIds.filter((templateId) => {
      const result = byTemplate.get(templateId);
      return result?.roomCounts && result.wallTopology && result.hdbSignatures;
    }).length}/${templateIds.length} templates preserved.`,
    required,
    observed: Array.from(byTemplate.entries())
      .map(
        ([templateId, result]) =>
          `${templateId}:rooms=${result.roomCounts ? "pass" : "fail"},walls=${result.wallTopology ? "pass" : "fail"},signatures=${result.hdbSignatures ? "pass" : "fail"}`,
      )
      .join(", "),
    missing,
  };
}

function webGpuGate(evidence: unknown, templateIds: readonly TemplateId[]): Phase0GateResult {
  const required =
    "Live LBM benchmark reaches >=30fps on Redmi Note 13 baseline, and Tier 4 lookup stays <200ms for every selected illustrative-airflow template.";
  if (!isRecord(evidence)) return pending("webgpu_redmi_benchmark", required, "evidence must be an object.");

  const device = readString(evidence, "device") ?? "";
  const fpsSamples = readNumberArray(evidence, "fpsSamples");
  const tier4Lookups = readArray(evidence, "tier4LookupSamples");
  const missing: string[] = [];
  if (!/redmi\s+note\s+13/i.test(device)) missing.push("Device must be Redmi Note 13 baseline.");
  if (fpsSamples.length === 0) missing.push("At least one fpsSamples reading is required.");
  const medianFps = median(fpsSamples);
  if (medianFps < 30) missing.push("Median FPS must be at least 30.");
  if (typeof tier4Lookups === "string") {
    missing.push("tier4LookupSamples must be an array.");
  } else {
    const byTemplate = new Map<string, number[]>();
    for (const entry of tier4Lookups) {
      const templateId = readString(entry, "templateId");
      if (templateId && isTemplateId(templateId)) {
        byTemplate.set(templateId, readNumberArray(entry, "lookupMs"));
      }
    }
    for (const templateId of templateIds) {
      const lookupMs = byTemplate.get(templateId);
      if (!lookupMs || lookupMs.length === 0) {
        missing.push(`Missing Tier 4 lookup samples for ${templateId}.`);
        continue;
      }
      if (lookupMs.some((value) => value >= 200)) {
        missing.push(`${templateId} has Tier 4 lookup samples at or above 200ms.`);
      }
    }
  }

  return {
    gateId: "webgpu_redmi_benchmark",
    passed: missing.length === 0,
    summary: `${device || "unknown device"} median ${medianFps.toFixed(1)}fps; Tier 4 lookup <200ms required.`,
    required,
    observed: `${fpsSamples.length} fps samples, median ${medianFps.toFixed(1)}fps`,
    missing,
  };
}

function resonanceGate(evidence: unknown, templateIds: readonly TemplateId[]): Phase0GateResult {
  const required = "Each template selected for home weather alignment fires between 1x/week and 4x/week across one month of historical wind records.";
  const templateWeeks = readArray(evidence, "templateWeeks");
  if (typeof templateWeeks === "string") return pending("resonance_historical_wind", required, templateWeeks);

  const byTemplate = new Map<string, number[]>();
  for (const entry of templateWeeks) {
    const templateId = readString(entry, "templateId");
    if (templateId && isTemplateId(templateId)) {
      byTemplate.set(templateId, readNumberArray(entry, "weeklyFires"));
    }
  }

  const missing: string[] = [];
  for (const templateId of templateIds) {
    const weeklyFires = byTemplate.get(templateId);
    if (!weeklyFires || weeklyFires.length < 4) {
      missing.push(`Missing four weekly historical fire counts for ${templateId}.`);
      continue;
    }
    if (weeklyFires.some((count) => count < 1 || count > 4)) {
      missing.push(`${templateId} has weekly fire counts outside 1..4.`);
    }
  }

  return {
    gateId: "resonance_historical_wind",
    passed: missing.length === 0,
    summary: `${templateIds.length - missing.length}/${templateIds.length} templates inside weekly frequency band.`,
    required,
    observed: Array.from(byTemplate.entries()).map(([templateId, counts]) => `${templateId}:${counts.join("/")}`).join(", "),
    missing,
  };
}

function pending(gateId: Phase0GateId, required: string, message: string): Phase0GateResult {
  return {
    gateId,
    passed: false,
    summary: "Evidence missing.",
    required,
    observed: "none",
    missing: [message],
  };
}

function readArray(value: unknown, key: string): unknown[] | string {
  if (!isRecord(value)) return "evidence must be an object.";
  const candidate = value[key];
  if (!Array.isArray(candidate)) return `${key} must be an array.`;
  return candidate;
}

function readString(value: unknown, key: string): string | null {
  if (!isRecord(value)) return null;
  const candidate = value[key];
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

function readBoolean(value: unknown, key: string): boolean | null {
  if (!isRecord(value)) return null;
  return typeof value[key] === "boolean" ? value[key] : null;
}

function readNumber(value: unknown, key: string): number {
  if (!isRecord(value)) return Number.POSITIVE_INFINITY;
  const candidate = value[key];
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : Number.POSITIVE_INFINITY;
}

function readNumberArray(value: unknown, key: string): number[] {
  if (!isRecord(value) || !Array.isArray(value[key])) return [];
  return value[key].filter((item): item is number => typeof item === "number" && Number.isFinite(item));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
