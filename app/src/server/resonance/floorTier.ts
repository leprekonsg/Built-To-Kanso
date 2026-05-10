import type { FloorTier, FrequencyTier } from "./types";

// Floor-tier matrix (brief §6.1 + §14.2):
//   1-3   ground       silent (no notifications)
//   4-8   transition   max 1 / 7 days
//   9-15  golden       max 3 / 7 days
//   16+   turbulent    max 1 / 3 days
export function floorToTier(floor: number): FloorTier {
  if (floor <= 3) return "ground";
  if (floor <= 8) return "transition";
  if (floor <= 15) return "golden";
  return "turbulent";
}

export function tierMaxNotificationsPerWindow(
  tier: FloorTier,
): { count: number; windowDays: number } | null {
  switch (tier) {
    case "ground":
      return null;
    case "transition":
      return { count: 1, windowDays: 7 };
    case "golden":
      return { count: 3, windowDays: 7 };
    case "turbulent":
      return { count: 1, windowDays: 3 };
  }
}

export function defaultFrequencyTierForFloor(floor: number): FrequencyTier {
  return floorToTier(floor) === "turbulent" ? "calm" : "standard";
}
