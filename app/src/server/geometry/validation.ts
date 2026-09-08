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

function containsPoint(rect: Rect, point: { x: number; y: number }): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function containsRect(bounds: Rect, rect: Rect): boolean {
  return rect.x >= bounds.x && rect.y >= bounds.y && rect.x + rect.width <= bounds.x + bounds.width && rect.y + rect.height <= bounds.y + bounds.height;
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
    if (hasDuplicate(opening.roomIds)) issues.push(`Opening "${opening.id}" adjoining rooms must be unique.`);
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
    if (element.kind === "pipeshaft_opening" && !containsRect(plan.bounds, element)) {
      issues.push(`Pipeshaft opening "${element.id}" must lie within plan bounds.`);
    }
  }

  if (plan.pipeshaft) {
    const shaft = plan.pipeshaft;
    const shaftRoom = plan.rooms.find((room) => room.id === shaft.roomId);
    if (!shaftRoom) issues.push(`Pipeshaft "${shaft.id}" references an unknown room.`);
    else if (!["service", "kitchen", "bathroom"].includes(shaftRoom.kind)) {
      issues.push(`Pipeshaft "${shaft.id}" room must be a service, kitchen, or bathroom space.`);
    }
    if (shaft.jetVelocityMps.length !== 2 || ![shaft.openingPoint.x, shaft.openingPoint.y, shaft.openingDirectionDeg, ...shaft.jetVelocityMps, shaft.bufferRadiusM].every(Number.isFinite)) {
      issues.push(`Pipeshaft "${shaft.id}" values must be finite.`);
    }
    if (shaft.jetVelocityMps[0] < 0 || shaft.jetVelocityMps[1] < shaft.jetVelocityMps[0]) {
      issues.push(`Pipeshaft "${shaft.id}" velocity range must be non-negative and ordered.`);
    }
    if (shaft.bufferRadiusM <= 0) issues.push(`Pipeshaft "${shaft.id}" buffer radius must be greater than zero.`);
    if (shaftRoom && !containsPoint(shaftRoom, shaft.openingPoint)) {
      issues.push(`Pipeshaft "${shaft.id}" opening point must lie within room "${shaft.roomId}".`);
    }
    if (hasDuplicate(shaft.downwindRoomIds) || shaft.downwindRoomIds.some((id) => !roomIdSet.has(id))) {
      issues.push(`Pipeshaft "${shaft.id}" downwind rooms must be unique known rooms.`);
    }
    if (!containsPoint(plan.bounds, shaft.openingPoint)) issues.push(`Pipeshaft "${shaft.id}" opening point must lie within plan bounds.`);
    const shaftElements = plan.fixedElements.filter((element) => element.kind === "pipeshaft_opening");
    const matchingElements = shaftElements.filter((element) => containsPoint(element, shaft.openingPoint));
    if (shaftElements.length !== 1 || matchingElements.length !== 1) {
      issues.push(`Pipeshaft "${shaft.id}" must have exactly one physical opening containing its opening point.`);
    }
  } else if (plan.fixedElements.some((element) => element.kind === "pipeshaft_opening" || element.bufferEligible)) {
    issues.push("Pipeshaft physical elements require a corresponding pipeshaft record.");
  }

  if (plan.bathrooms.length === 0) issues.push("Plan must include at least one bathroom.");
  for (const bathroom of plan.bathrooms) {
    const room = plan.rooms.find((candidate) => candidate.id === bathroom.roomId);
    if (!room) issues.push(`Bathroom "${bathroom.roomId}" must exist in rooms.`);
    else if (room.kind !== "bathroom") issues.push(`Bathroom "${bathroom.roomId}" must reference a room with kind "bathroom".`);
    if (![bathroom.exhaustPoint.x, bathroom.exhaustPoint.y].every(Number.isFinite)) {
      issues.push(`Bathroom "${bathroom.roomId}" exhaust point must be finite.`);
    } else if (room && !containsPoint(room, bathroom.exhaustPoint)) {
      issues.push(`Bathroom "${bathroom.roomId}" exhaust point must lie within its room.`);
    }
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
