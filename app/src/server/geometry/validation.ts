import type { ExpresswayAdjacency, GeometryValidationResult, PlanGeometry, Rect } from "./types";

const VALID_EXPRESSWAY_ADJACENCY = new Set<ExpresswayAdjacency>([
  "none",
  "near_pie",
  "near_aye",
  "near_bke",
  "near_cte",
  "near_kpe",
]);

function isPositiveRect(rect: Rect): boolean {
  return [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0;
}

function hasDuplicate(values: string[]): boolean {
  return new Set(values).size !== values.length;
}

export function validatePlanGeometry(plan: PlanGeometry): GeometryValidationResult {
  const issues: string[] = [];

  if (plan.schemaVersion !== 1) issues.push("Unsupported plan geometry schema version.");
  if (plan.units !== "meters") issues.push("Plan geometry units must be meters.");
  if (!isPositiveRect(plan.bounds)) issues.push("Plan bounds must have positive width and height.");
  if (!Number.isFinite(plan.openingAreaPct) || plan.openingAreaPct <= 0) issues.push("Opening area percentage must be a finite number greater than zero.");
  if (!Number.isFinite(plan.westSunFacadeDeg) || !Number.isFinite(plan.defaultDoorFacingDeg)) {
    issues.push("Plan orientations must be finite numbers.");
  }

  const roomIds = plan.rooms.map((room) => room.id);
  if (hasDuplicate(roomIds)) issues.push("Room ids must be unique.");
  for (const room of plan.rooms) {
    if (!isPositiveRect(room)) issues.push(`Room "${room.id}" must have positive dimensions.`);
  }

  const roomIdSet = new Set(roomIds);
  const openingIds = plan.openings.map((opening) => opening.id);
  if (hasDuplicate(openingIds)) issues.push("Opening ids must be unique.");
  for (const opening of plan.openings) {
    if (opening.roomIds.length === 0) issues.push(`Opening "${opening.id}" must declare at least one adjoining room.`);
    if (opening.roomIds.some((id) => !roomIdSet.has(id))) {
      issues.push(`Opening "${opening.id}" references an unknown room.`);
    }
    if (![opening.start.x, opening.start.y, opening.end.x, opening.end.y].every(Number.isFinite)) {
      issues.push(`Opening "${opening.id}" coordinates must be finite.`);
    }
    if (opening.start.x === opening.end.x && opening.start.y === opening.end.y) {
      issues.push(`Opening "${opening.id}" must have non-zero length.`);
    }
  }
  for (const element of plan.fixedElements) {
    if (!isPositiveRect(element)) issues.push(`Fixed element "${element.id}" must have finite positive dimensions.`);
  }

  if (plan.bathrooms.length === 0) issues.push("Plan must include at least one bathroom.");
  for (const bathroom of plan.bathrooms) {
    if (!roomIdSet.has(bathroom.roomId)) issues.push(`Bathroom "${bathroom.roomId}" must exist in rooms.`);
  }

  if (plan.siteContext !== undefined) {
    const adjacency = plan.siteContext.expresswayAdjacency;
    if (adjacency !== undefined && !VALID_EXPRESSWAY_ADJACENCY.has(adjacency)) {
      issues.push(
        `siteContext.expresswayAdjacency "${adjacency}" must be one of none, near_pie, near_aye, near_bke, near_cte, near_kpe.`,
      );
    }
    const distance = plan.siteContext.expresswayDistanceM;
    if (distance !== undefined && (!Number.isFinite(distance) || distance < 0)) {
      issues.push("siteContext.expresswayDistanceM must be a non-negative finite number.");
    }
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
