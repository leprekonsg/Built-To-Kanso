import { NextResponse } from "next/server";
import { getGeometryReleaseGate, getPlanGeometry, isTemplateId } from "./registry";
import { geometrySha256 } from "./provenance";
import type { PlanGeometry, TemplateId } from "./types";
import { PHASE1_RELEASE_MANIFEST, releaseManifestEntry, type ReleaseManifest, type ReleaseOutput } from "./releaseManifest";

export type GeometryCapability = keyof ReturnType<typeof getGeometryReleaseGate>["capabilities"];
type GeometryGate = ReturnType<typeof getGeometryReleaseGate>;
export interface GeometryReleaseDependencies {
  getGate: (templateId: TemplateId) => GeometryGate;
  getPlan: (templateId: TemplateId) => PlanGeometry;
}
const DEFAULT_DEPENDENCIES: GeometryReleaseDependencies = { getGate: getGeometryReleaseGate, getPlan: getPlanGeometry };

function geometryNotReadyResponse(templateId: TemplateId, releaseGate: GeometryGate): NextResponse {
  return NextResponse.json({
    error: "geometry_not_ready",
    message: "This layout is awaiting source and geometry review. Recommendations, simulation and presentation assets are not available yet.",
    nextAction: "Supply the identified dimensioned drawing and complete a review bound to this geometry. The geometry endpoint remains available for diagnostic inspection.",
    diagnosticUrl: `/api/templates/${templateId}/geometry`,
    releaseGate,
  }, { status: 422, headers: { "Cache-Control": "no-store", "X-Geometry-Status": "not-ready" } });
}

/** Shared boundary for resident-ready advice, analysis and presentation assets. */
export function geometryReleaseResponse(templateId: TemplateId): NextResponse | null {
  const releaseGate = getGeometryReleaseGate(templateId);
  if (releaseGate.eligible) return null;
  return geometryNotReadyResponse(templateId, releaseGate);
}

export function geometryCapabilityResponse(
  templateId: TemplateId,
  capability: GeometryCapability,
  dependencies: GeometryReleaseDependencies = DEFAULT_DEPENDENCIES,
): NextResponse | null {
  const gate = dependencies.getGate(templateId);
  if (!gate.eligible) return geometryNotReadyResponse(templateId, gate);
  const status = gate.capabilities[capability];
  return status.available ? null : NextResponse.json({ error: "geometry_capability_not_ready", capability, message: status.reason, nextAction: "Use only a capability whose prerequisites are recorded and verified for this layout.", diagnosticUrl: `/api/templates/${templateId}/geometry` }, { status: 422, headers: { "Cache-Control": "no-store", "X-Geometry-Status": "capability-not-ready" } });
}

/** Presentation output needs both its feature prerequisites and version selection. */
export function geometryOutputResponse(
  templateId: TemplateId,
  output: ReleaseOutput,
  dependencies: GeometryReleaseDependencies = DEFAULT_DEPENDENCIES,
  manifest: ReleaseManifest = PHASE1_RELEASE_MANIFEST,
): NextResponse | null {
  const capability = output === "wind_sketch" ? "illustrativeAirflow"
    : output === "resonance_hour" ? "homeWeatherAlignment" : "layoutDisplay";
  const blocked = geometryCapabilityResponse(templateId, capability, dependencies);
  if (blocked) return blocked;
  if (releaseManifestEntry(templateId, manifest)?.outputs.includes(output)) return null;
  return NextResponse.json({ error: "output_not_released", output,
    message: "This output is not included in the current release. Use the available layout inspection." },
  { status: 422, headers: { "Cache-Control": "no-store", "X-Geometry-Status": "output-not-released" } });
}

export function submittedGeometryReleaseResponse(
  plan: unknown,
  dependencies: GeometryReleaseDependencies = DEFAULT_DEPENDENCIES,
): NextResponse | null {
  if (!plan || typeof plan !== "object" || !("templateId" in plan) || typeof plan.templateId !== "string" || !isTemplateId(plan.templateId)) {
    return NextResponse.json({ error: "A known templateId is required in plan." }, { status: 400 });
  }
  const gate = dependencies.getGate(plan.templateId);
  if (!gate.eligible) return geometryNotReadyResponse(plan.templateId, gate);
  dependencies.getPlan(plan.templateId);
  const submittedPlan = Object.fromEntries(
    Object.entries(plan as Record<string, unknown>).filter(([key]) => key !== "releaseGate" && key !== "diagnosticOnly"),
  ) as unknown as PlanGeometry;
  if (geometrySha256(submittedPlan) !== gate.provenance.geometrySha256) {
    return NextResponse.json({ error: "geometry_changed", message: "The submitted plan differs from the reviewed geometry. Reload the current template." }, { status: 409 });
  }
  return null;
}

export function submittedGeometryCapabilityResponse(
  plan: unknown,
  capability: GeometryCapability,
  dependencies: GeometryReleaseDependencies = DEFAULT_DEPENDENCIES,
): NextResponse | null {
  const blocked = submittedGeometryReleaseResponse(plan, dependencies);
  if (blocked) return blocked;
  const templateId = (plan as PlanGeometry).templateId;
  const status = dependencies.getGate(templateId).capabilities[capability];
  if (status.available) return null;
  return NextResponse.json({
    error: "geometry_capability_not_ready",
    capability,
    message: status.reason,
    nextAction: "Use only a capability whose prerequisites are recorded and verified for this layout.",
    diagnosticUrl: `/api/templates/${templateId}/geometry`,
  }, { status: 422, headers: { "Cache-Control": "no-store", "X-Geometry-Status": "capability-not-ready" } });
}
