// Shared parser for the four Threshold inputs that gate `/bones` and
// `/recommendation-proof`. Returns a discriminated result: each input is
// either parsed or absent, and any present-but-malformed value is collected
// in `issues` so the page can render an actionable diagnostic instead of the
// generic anteroom.
//
// Required IDs:
//   template  — one of `TEMPLATE_IDS`
//   scenario  — one of `SCENARIO_IDS` (mirrors lib/store.ts `SCENARIOS`)
//   compass   — finite degree; circular, silently wraps to 0-345 in 15° steps
//   floor     — integer 1-50 inclusive; out-of-range is rejected (not clamped)

import { isTemplateId } from "@/server/geometry/registry";
import type { TemplateId } from "./templates";

export type ScenarioId =
  | "just-moved-in"
  | "mid-renovation"
  | "considering-changes"
  | "long-term-resident";

// Must stay in sync with `SCENARIOS` in `lib/store.ts`. The store is a
// "use client" module; this list is duplicated here so server pages can
// validate without forcing client-bundle imports.
export const SCENARIO_IDS: readonly ScenarioId[] = [
  "just-moved-in",
  "mid-renovation",
  "considering-changes",
  "long-term-resident",
];

export const TEMPLATE_IDS: readonly TemplateId[] = [
  "tampines-greenweave",
  "tengah-5room",
  "resale-exec-1990s",
];

const COMPASS_STEP_DEG = 15;
const FLOOR_MIN = 1;
const FLOOR_MAX = 50;

export type ThresholdField = "template" | "compass" | "floor" | "scenario";

export interface ThresholdParamIssue {
  field: ThresholdField;
  raw: string;
  reason: string;
}

export interface ParsedThresholdParams {
  templateId: TemplateId | null;
  compassDeg: number | null;
  floor: number | null;
  scenarioId: ScenarioId | null;
  issues: ThresholdParamIssue[];
}

export interface RawThresholdParams {
  template?: string;
  compass?: string;
  floor?: string;
  scenario?: string;
}

export function parseThresholdParams(raw: RawThresholdParams): ParsedThresholdParams {
  const issues: ThresholdParamIssue[] = [];
  return {
    templateId: parseTemplate(raw.template, issues),
    compassDeg: parseCompass(raw.compass, issues),
    floor: parseFloor(raw.floor, issues),
    scenarioId: parseScenario(raw.scenario, issues),
    issues,
  };
}

function parseTemplate(value: string | undefined, issues: ThresholdParamIssue[]): TemplateId | null {
  if (value === undefined || value === "") return null;
  if (isTemplateId(value)) return value;
  issues.push({
    field: "template",
    raw: value,
    reason: `Unknown template. Expected: ${TEMPLATE_IDS.join(", ")}.`,
  });
  return null;
}

function parseCompass(value: string | undefined, issues: ThresholdParamIssue[]): number | null {
  if (value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    issues.push({
      field: "compass",
      raw: value,
      reason: "Not a number. Use a degree value (snaps to 15° steps; values wrap around 360°).",
    });
    return null;
  }
  return ((Math.round(parsed / COMPASS_STEP_DEG) * COMPASS_STEP_DEG) % 360 + 360) % 360;
}

function parseFloor(value: string | undefined, issues: ThresholdParamIssue[]): number | null {
  if (value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    issues.push({
      field: "floor",
      raw: value,
      reason: `Not a number. Use a floor ${FLOOR_MIN}-${FLOOR_MAX}.`,
    });
    return null;
  }
  const rounded = Math.round(parsed);
  if (rounded < FLOOR_MIN || rounded > FLOOR_MAX) {
    issues.push({
      field: "floor",
      raw: value,
      reason: `Out of range. Use a floor ${FLOOR_MIN}-${FLOOR_MAX}.`,
    });
    return null;
  }
  return rounded;
}

function parseScenario(value: string | undefined, issues: ThresholdParamIssue[]): ScenarioId | null {
  if (value === undefined || value === "") return null;
  if ((SCENARIO_IDS as readonly string[]).includes(value)) return value as ScenarioId;
  issues.push({
    field: "scenario",
    raw: value,
    reason: `Unknown scenario. Expected: ${SCENARIO_IDS.join(", ")}.`,
  });
  return null;
}
