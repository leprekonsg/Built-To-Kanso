import resaleExec1990s from "@/data/templates/resale-exec-1990s/plan-geometry.json";
import tampinesGreenweave from "@/data/templates/tampines-greenweave/plan-geometry.json";
import tengah5Room from "@/data/templates/tengah-5room/plan-geometry.json";
import resaleManifest from "@/data/templates/resale-exec-1990s/source-manifest.json";
import resaleReview from "@/data/templates/resale-exec-1990s/geometry-review.json";
import tampinesManifest from "@/data/templates/tampines-greenweave/source-manifest.json";
import tampinesReview from "@/data/templates/tampines-greenweave/geometry-review.json";
import tengahManifest from "@/data/templates/tengah-5room/source-manifest.json";
import tengahReview from "@/data/templates/tengah-5room/geometry-review.json";
import type { GeometryReviewRecord, GeometrySourceManifest, PlanGeometry, TemplateId } from "./types";
import { evaluateGeometryReleaseGate } from "./provenance";
import type { ReleaseManifest } from "./releaseManifest";

const GEOMETRIES: Record<TemplateId, PlanGeometry> = {
  "tampines-greenweave": tampinesGreenweave as unknown as PlanGeometry,
  "tengah-5room": tengah5Room as unknown as PlanGeometry,
  "resale-exec-1990s": resaleExec1990s as unknown as PlanGeometry,
};

const MANIFESTS = {
  "tampines-greenweave": tampinesManifest,
  "tengah-5room": tengahManifest,
  "resale-exec-1990s": resaleManifest,
} as unknown as Record<TemplateId, GeometrySourceManifest>;

const REVIEWS = {
  "tampines-greenweave": tampinesReview,
  "tengah-5room": tengahReview,
  "resale-exec-1990s": resaleReview,
} as unknown as Record<TemplateId, GeometryReviewRecord>;

export function isTemplateId(value: string): value is TemplateId {
  return value === "tampines-greenweave" || value === "tengah-5room" || value === "resale-exec-1990s";
}

export function getPlanGeometry(templateId: TemplateId): PlanGeometry {
  return GEOMETRIES[templateId];
}

export function getGeometryReleaseGate(templateId: TemplateId, releaseManifest?: ReleaseManifest) {
  return evaluateGeometryReleaseGate(GEOMETRIES[templateId], MANIFESTS[templateId], REVIEWS[templateId], releaseManifest);
}

export function listGeometrySummaries() {
  return Object.values(GEOMETRIES).map((plan) => ({
    templateId: plan.templateId,
    bounds: plan.bounds,
    openingAreaPct: plan.openingAreaPct,
    westSunFacadeDeg: plan.westSunFacadeDeg,
    rooms: plan.rooms.length,
    blackElements: plan.fixedElements.length,
    pipeshaftRoomId: plan.pipeshaft?.roomId ?? null,
  }));
}
