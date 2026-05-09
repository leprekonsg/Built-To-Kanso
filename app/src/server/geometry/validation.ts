import type { GeometryValidationResult, PlanGeometry, Rect } from "./types";

function isPositiveRect(rect: Rect): boolean {
  return rect.width > 0 && rect.height > 0;
}

function hasDuplicate(values: string[]): boolean {
  return new Set(values).size !== values.length;
}

export function validatePlanGeometry(plan: PlanGeometry): GeometryValidationResult {
  const issues: string[] = [];

  if (plan.schemaVersion !== 1) issues.push("Unsupported plan geometry schema version.");
  if (plan.units !== "meters") issues.push("Plan geometry units must be meters.");
  if (!isPositiveRect(plan.bounds)) issues.push("Plan bounds must have positive width and height.");
  if (plan.openingAreaPct <= 0) issues.push("Opening area percentage must be greater than zero.");

  const roomIds = plan.rooms.map((room) => room.id);
  if (hasDuplicate(roomIds)) issues.push("Room ids must be unique.");
  for (const room of plan.rooms) {
    if (!isPositiveRect(room)) issues.push(`Room "${room.id}" must have positive dimensions.`);
  }

  const roomIdSet = new Set(roomIds);
  for (const opening of plan.openings) {
    if (opening.roomIds.some((id) => !roomIdSet.has(id))) {
      issues.push(`Opening "${opening.id}" references an unknown room.`);
    }
  }

  const blackKinds = new Set(plan.fixedElements.map((element) => element.kind));
  if (!blackKinds.has("household_shelter")) {
    issues.push("Plan must mark household shelter as a Black-state fixed element.");
  }
  if (!blackKinds.has("pipeshaft_opening")) {
    issues.push("Plan must mark pipeshaft opening as a Black-state fixed element.");
  }
  if (!plan.fixedElements.some((element) => element.kind === "pipeshaft_opening" && element.bufferEligible)) {
    issues.push("Pipeshaft opening must be buffer-eligible for Shaft Buffer placement.");
  }

  if (!roomIdSet.has(plan.pipeshaft.roomId)) {
    issues.push("Pipeshaft room must exist in rooms.");
  }
  if (plan.pipeshaft.bufferRadiusM !== 0.6) {
    issues.push("Shaft Buffer radius must be 0.6m.");
  }
  if (plan.pipeshaft.jetVelocityMps[0] < 0.15 || plan.pipeshaft.jetVelocityMps[1] > 0.25) {
    issues.push("Pipeshaft jet velocity must stay within the 0.15-0.25 m/s Phase 1 range.");
  }

  if (plan.bathrooms.length === 0) issues.push("Plan must include at least one bathroom.");
  for (const bathroom of plan.bathrooms) {
    if (!roomIdSet.has(bathroom.roomId)) issues.push(`Bathroom "${bathroom.roomId}" must exist in rooms.`);
  }

  return { ok: issues.length === 0, issues };
}

export function assertValidPlanGeometry(plan: PlanGeometry): PlanGeometry {
  const result = validatePlanGeometry(plan);
  if (!result.ok) {
    throw new Error(`Invalid plan geometry: ${result.issues.join(" ")}`);
  }
  return plan;
}
