import { NextResponse } from "next/server";
import { geometryReleaseResponse } from "@/server/geometry/releaseResponse";
import { getGeometryReleaseGate, getPlanGeometry } from "@/server/geometry/registry";
import { bindSimulationResult, buildScenario, parseIllustrativeAirflowScenario } from "@/lib/scenario";
import { WEATHER_TRIALS, withPlanCondition } from "@/server/simulation/fieldBuilders";
import { buildSimulation, validateSimulationRequest } from "@/server/simulation/tier4";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body must include templateId." }, { status: 400 });
  }

  const supplied = "scenario" in body ? body.scenario : undefined;
  const scenarioRecord = supplied && typeof supplied === "object" ? supplied as Record<string, unknown> : null;
  const geometry = scenarioRecord?.geometry && typeof scenarioRecord.geometry === "object" ? scenarioRecord.geometry as Record<string, unknown> : null;
  const conditions = scenarioRecord?.conditions && typeof scenarioRecord.conditions === "object" ? scenarioRecord.conditions as Record<string, unknown> : null;
  const validation = validateSimulationRequest(supplied === undefined ? body : {
    templateId: geometry?.templateId,
    tokenPlacements: scenarioRecord?.placements,
    condition: conditions?.weatherCondition,
  });

  if (typeof validation === "string") {
    return NextResponse.json({ error: validation }, { status: 400 });
  }

  const blocked = geometryReleaseResponse(validation.templateId);
  if (blocked) return blocked;
  const plan = getPlanGeometry(validation.templateId);
  const gate = getGeometryReleaseGate(validation.templateId);
  const condition = withPlanCondition(WEATHER_TRIALS[validation.condition], plan.westSunFacadeDeg);
  if (validation.candidatePositions.length) {
    return NextResponse.json({ error: "Compare each arrangement as its own scenario; candidatePositions is not supported." }, { status: 400 });
  }
  const scenario = supplied === undefined ? buildScenario({
    plan, geometryContentHash: gate.provenance.geometrySha256, geometryReleaseEligible: gate.eligible,
    planRotationDeg: null, mirrored: null, placements: validation.tokenPlacements,
    weatherCondition: validation.condition, windFromDeg: condition.compassDeg, ambientWindMps: condition.ambientWindMps,
  }) : parseIllustrativeAirflowScenario(supplied, plan, gate.provenance.geometrySha256);
  if (typeof scenario === "string") return NextResponse.json({ error: scenario }, { status: 400 });
  return NextResponse.json(bindSimulationResult(scenario, await buildSimulation(validation)), { headers: { "Cache-Control": "no-store" } });
}
