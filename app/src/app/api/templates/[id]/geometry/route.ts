import { NextResponse } from "next/server";
import { getPlanGeometry, getGeometryReleaseGate, isTemplateId } from "@/server/geometry/registry";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export function generateStaticParams() {
  return [
    { id: "tampines-greenweave" },
    { id: "tengah-5room" },
    { id: "resale-exec-1990s" },
  ];
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!isTemplateId(id)) {
    return NextResponse.json(
      { error: `Unknown template "${id}". Use one of: tampines-greenweave, tengah-5room, resale-exec-1990s.` },
      { status: 404 },
    );
  }

  const releaseGate = getGeometryReleaseGate(id);
  return NextResponse.json({ ...getPlanGeometry(id), releaseGate, diagnosticOnly: !releaseGate.eligible }, {
    headers: { "Cache-Control": "no-store", "X-Geometry-Use": releaseGate.eligible ? "reviewed" : "diagnostic-only" },
  });
}
