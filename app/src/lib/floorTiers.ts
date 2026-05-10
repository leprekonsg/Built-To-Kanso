// brief §6.1 — floor tier copy. Shared by Threshold UI and readiness checks.

export interface FloorTier {
  range: [number, number];
  name: string;
  copy: string;
}

export const FLOOR_TIERS: FloorTier[] = [
  {
    range: [1, 3],
    name: "Ground Stagnation",
    copy: "You're on a low floor. Wind reaches you less often. Resonance Hours will be quiet here — that's not a bug, that's your floor.",
  },
  {
    range: [4, 8],
    name: "Transition",
    copy: "Mid-low band. Mixed cross-ventilation depending on neighboring blocks.",
  },
  {
    range: [9, 15],
    name: "Golden Floors",
    copy: "You're in the range Singaporean masters call the Golden Floors. Optimal natural ventilation here.",
  },
  {
    range: [16, 50],
    name: "Wind Turbulent",
    copy: "High floor. Wind is strong but turbulent. Glow Scout will likely flag west-sun exposure first.",
  },
];

export function tierForFloor(floor: number): FloorTier {
  return (
    FLOOR_TIERS.find(({ range: [lo, hi] }) => floor >= lo && floor <= hi) ??
    FLOOR_TIERS[FLOOR_TIERS.length - 1]
  );
}
