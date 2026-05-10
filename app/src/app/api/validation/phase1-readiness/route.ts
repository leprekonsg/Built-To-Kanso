import { NextResponse } from "next/server";
import {
  buildPhase1ReadinessReport,
  type Phase0EvidenceBundle,
} from "@/server/validation/phase1Readiness";
import type { OperationalEvidence } from "@/server/validation/operationalPreflight";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await buildPhase1ReadinessReport());
}

export async function POST(request: Request) {
  let body: { phase0Evidence?: unknown; operationalEvidence?: unknown };
  try {
    body = (await request.json()) as { phase0Evidence?: unknown; operationalEvidence?: unknown };
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (body.phase0Evidence !== undefined && !isRecord(body.phase0Evidence)) {
    return NextResponse.json({ error: "phase0Evidence must be an object keyed by Phase 0 gate id." }, { status: 400 });
  }
  if (body.operationalEvidence !== undefined && !isRecord(body.operationalEvidence)) {
    return NextResponse.json(
      { error: "operationalEvidence must be an object with non-secret external readiness evidence." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    await buildPhase1ReadinessReport(
      process.env,
      (body.phase0Evidence ?? {}) as Phase0EvidenceBundle,
      normalizeOperationalEvidence(body.operationalEvidence),
    ),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeOperationalEvidence(value: unknown): OperationalEvidence {
  if (!isRecord(value)) return {};
  const openaiTier2Account = value.openaiTier2Account;
  if (!isRecord(openaiTier2Account)) return {};
  return {
    openaiTier2Account: {
      verified: openaiTier2Account.verified === true,
      verifiedAtIso: typeof openaiTier2Account.verifiedAtIso === "string" ? openaiTier2Account.verifiedAtIso : undefined,
      reviewer: typeof openaiTier2Account.reviewer === "string" ? openaiTier2Account.reviewer : undefined,
    },
  };
}
