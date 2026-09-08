import { NextResponse } from "next/server";
import { getGeometryReleaseGate, isTemplateId } from "./registry";
import { geometrySha256 } from "./provenance";
import type { PlanGeometry, TemplateId } from "./types";

/** Shared boundary for resident-ready advice, analysis and presentation assets. */
export function geometryReleaseResponse(templateId: TemplateId): NextResponse | null {
  const releaseGate = getGeometryReleaseGate(templateId);
  if (releaseGate.eligible) return null;
  return NextResponse.json({
    error: "geometry_not_ready",
    message: "This layout is awaiting source and geometry review. Recommendations, simulation and presentation assets are not available yet.",
    nextAction: "Supply the identified dimensioned drawing and complete a review bound to this geometry. The geometry endpoint remains available for diagnostic inspection.",
    diagnosticUrl: `/api/templates/${templateId}/geometry`,
    releaseGate,
  }, { status: 422, headers: { "Cache-Control": "no-store", "X-Geometry-Status": "not-ready" } });
}

export function submittedGeometryReleaseResponse(plan: unknown): NextResponse | null {
  if (!plan || typeof plan !== "object" || !("templateId" in plan) || typeof plan.templateId !== "string" || !isTemplateId(plan.templateId)) {
    return NextResponse.json({ error: "A known templateId is required in plan." }, { status: 400 });
  }
  const blocked = geometryReleaseResponse(plan.templateId);
  if (blocked) return blocked;
  if (geometrySha256(plan as PlanGeometry) !== getGeometryReleaseGate(plan.templateId).provenance.geometrySha256) {
    return NextResponse.json({ error: "geometry_changed", message: "The submitted plan differs from the reviewed geometry. Reload the current template." }, { status: 409 });
  }
  return null;
}
