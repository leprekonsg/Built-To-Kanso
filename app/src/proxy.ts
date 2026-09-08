import { NextResponse, type NextRequest } from "next/server";
import { isTemplateId } from "@/server/geometry/registry";
import { geometryOutputResponse } from "@/server/geometry/releaseResponse";
import type { ReleaseOutput } from "@/server/geometry/releaseManifest";

const OUTPUTS: Record<string, ReleaseOutput> = {
  "plan-sketches": "plan_sketch", "life-anchors": "life_sketch", "life-sketches": "life_sketch",
  "wind-base": "wind_sketch", "resonance-hour": "resonance_hour",
};

// Public cache files must obey the same release boundary as generated outputs.
export function proxy(request: NextRequest) {
  const [, directory, templateId] = request.nextUrl.pathname.split("/");
  if (typeof templateId !== "string" || !isTemplateId(templateId)) return new NextResponse(null, { status: 404 });
  return geometryOutputResponse(templateId, OUTPUTS[directory]) ?? NextResponse.next();
}

export const config = {
  matcher: ["/plan-sketches/:path*", "/life-anchors/:path*", "/life-sketches/:path*", "/wind-base/:path*", "/resonance-hour/:path*"],
};
