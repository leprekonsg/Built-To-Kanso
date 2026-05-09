import { NextResponse } from "next/server";
import { buildTier4Simulation, validateSimulationRequest } from "@/server/simulation/tier4";

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

  const validation = validateSimulationRequest(body);

  if (typeof validation === "string") {
    return NextResponse.json({ error: validation }, { status: 400 });
  }

  return NextResponse.json(buildTier4Simulation(validation));
}
