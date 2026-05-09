import resaleExec1990s from "@/data/templates/resale-exec-1990s/plan-geometry.json";
import tampinesGreenweave from "@/data/templates/tampines-greenweave/plan-geometry.json";
import tengah5Room from "@/data/templates/tengah-5room/plan-geometry.json";
import type { PlanGeometry, TemplateId } from "./types";
import { assertValidPlanGeometry } from "./validation";

const GEOMETRIES: Record<TemplateId, PlanGeometry> = {
  "tampines-greenweave": assertValidPlanGeometry(tampinesGreenweave as unknown as PlanGeometry),
  "tengah-5room": assertValidPlanGeometry(tengah5Room as unknown as PlanGeometry),
  "resale-exec-1990s": assertValidPlanGeometry(resaleExec1990s as unknown as PlanGeometry),
};

export function isTemplateId(value: string): value is TemplateId {
  return value === "tampines-greenweave" || value === "tengah-5room" || value === "resale-exec-1990s";
}

export function getPlanGeometry(templateId: TemplateId): PlanGeometry {
  return GEOMETRIES[templateId];
}

export function listGeometrySummaries() {
  return Object.values(GEOMETRIES).map((plan) => ({
    templateId: plan.templateId,
    bounds: plan.bounds,
    openingAreaPct: plan.openingAreaPct,
    westSunFacadeDeg: plan.westSunFacadeDeg,
    rooms: plan.rooms.length,
    blackElements: plan.fixedElements.length,
    pipeshaftRoomId: plan.pipeshaft.roomId,
  }));
}
