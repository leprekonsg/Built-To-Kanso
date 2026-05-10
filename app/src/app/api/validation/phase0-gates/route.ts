import { NextResponse } from "next/server";
import {
  evaluatePhase0Gate,
  evaluateTemplateArchitectureVerification,
  PHASE0_GATE_REQUIREMENTS,
  type Phase0GateId,
} from "@/server/validation/phase0Gates";

const GATE_IDS: readonly Phase0GateId[] = [
  "empty_room_beauty",
  "life_sketch_preservation",
  "webgpu_redmi_benchmark",
  "live_studio_comprehension",
  "magic_90_seconds",
  "behavioral_overconfidence",
  "resonance_historical_wind",
  "material_slider_comprehension",
];

export async function GET() {
  const automatedGates = [evaluateTemplateArchitectureVerification()];

  return NextResponse.json({
    ready: true,
    totalGateCount: GATE_IDS.length + automatedGates.length,
    gateIds: GATE_IDS,
    requirements: PHASE0_GATE_REQUIREMENTS,
    automatedGates,
    message: "Post real Phase 0 tester, device, GPT edit, or historical-wind evidence to evaluate gate status.",
  });
}

export async function POST(request: Request) {
  let body: { gateId?: unknown; evidence?: unknown };
  try {
    body = (await request.json()) as { gateId?: unknown; evidence?: unknown };
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (typeof body.gateId !== "string" || !isGateId(body.gateId)) {
    return NextResponse.json(
      { error: `gateId must be one of: ${GATE_IDS.join(", ")}.` },
      { status: 400 },
    );
  }

  return NextResponse.json(evaluatePhase0Gate(body.gateId, body.evidence));
}

function isGateId(value: string): value is Phase0GateId {
  return (GATE_IDS as readonly string[]).includes(value);
}
