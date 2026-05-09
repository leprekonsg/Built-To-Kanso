import type { FloorTier } from "./types";

// Floor-tier matrix (brief Phase 1 §23):
//   1-3   ground       silent (no notifications)
//   4-7   transition   max 1 / 7 days
//   8-22  golden       max 3 / 7 days
//   23+   turbulent    max 1 / 3 days
export function floorToTier(floor: number): FloorTier {
  if (floor <= 3) return "ground";
  if (floor <= 7) return "transition";
  if (floor <= 22) return "golden";
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
