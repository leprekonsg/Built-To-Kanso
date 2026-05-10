"use client";

import { create } from "zustand";
import type { TemplateId } from "./templates";
export { FLOOR_TIERS, tierForFloor, type FloorTier } from "./floorTiers";

// brief §6.1 — Stage 1 collects four inputs, nothing more.
// Compass is the discrete 24-direction snap (every 15°).

export type ScenarioId =
  | "just-moved-in"
  | "mid-renovation"
  | "considering-changes"
  | "long-term-resident";

export interface Scenario {
  id: ScenarioId;
  label: string;
  hint: string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: "just-moved-in",
    label: "Just moved in",
    hint: "Within the first 90 days. Anti-Cure recommendations stay live.",
  },
  {
    id: "mid-renovation",
    label: "Mid-renovation",
    hint: "Walls open, decisions reversible. Designer mode favored.",
  },
  {
    id: "considering-changes",
    label: "Considering changes",
    hint: "Settled but curious. Behavior tokens ranked first.",
  },
  {
    id: "long-term-resident",
    label: "Long-term resident",
    hint: "Years in. Resonance Hours and seasonal cues come first.",
  },
];

export interface ThresholdState {
  templateId: TemplateId | null;
  // 0..23, where 0 = N, 6 = E, 12 = S, 18 = W (15° increments)
  compassIndex: number;
  // 1..50 (HDB max ~ Pinnacle@Duxton 50)
  floor: number;
  scenarioId: ScenarioId | null;
  // Hard Rule #25: Continue requires explicit floor + compass interaction.
  // Defaults are starting points, not consent.
  compassTouched: boolean;
  floorTouched: boolean;

  setTemplate: (id: TemplateId) => void;
  setCompass: (index: number) => void;
  setFloor: (n: number) => void;
  setScenario: (id: ScenarioId) => void;
  markCompassTouched: () => void;
  markFloorTouched: () => void;
  reset: () => void;
}

const INITIAL: Omit<
  ThresholdState,
  | "setTemplate"
  | "setCompass"
  | "setFloor"
  | "setScenario"
  | "markCompassTouched"
  | "markFloorTouched"
  | "reset"
> = {
  templateId: null,
  compassIndex: 0,
  floor: 11,
  scenarioId: null,
  compassTouched: false,
  floorTouched: false,
};

export const useThresholdStore = create<ThresholdState>()((set) => ({
  ...INITIAL,
  setTemplate: (templateId) => set({ templateId }),
  setCompass: (compassIndex) => set({ compassIndex: ((compassIndex % 24) + 24) % 24 }),
  setFloor: (floor) => set({ floor: Math.max(1, Math.min(50, Math.round(floor))) }),
  setScenario: (scenarioId) => set({ scenarioId }),
  // Idempotent: only flips false -> true so re-touching is a no-op.
  markCompassTouched: () =>
    set((s) => (s.compassTouched ? s : { compassTouched: true })),
  markFloorTouched: () =>
    set((s) => (s.floorTouched ? s : { floorTouched: true })),
  reset: () => set(INITIAL),
}));

// Derived: 24 compass labels at 15° increments. N is index 0.
export const COMPASS_LABELS_24 = [
  "N", "NNE", "NE", "ENE",
  "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW",
  "W", "WNW", "NW", "NNW",
  // The "24-direction" ring used by Form-School luopans subdivides further;
  // we surface the 16-rose for clarity and keep 24 internal slots for snap.
  "N+", "NE+", "E+", "SE+", "S+", "SW+", "W+", "NW+",
] as const;
