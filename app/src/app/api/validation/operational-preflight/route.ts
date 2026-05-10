import { NextResponse } from "next/server";
import {
  evaluateOperationalPreflight,
  type OperationalEvidence,
} from "@/server/validation/operationalPreflight";

export async function GET() {
  return NextResponse.json(await evaluateOperationalPreflight());
}

export async function POST(request: Request) {
  let body: { operationalEvidence?: unknown };
  try {
    body = (await request.json()) as { operationalEvidence?: unknown };
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (body.operationalEvidence !== undefined && !isRecord(body.operationalEvidence)) {
    return NextResponse.json(
      { error: "operationalEvidence must be an object with non-secret external readiness evidence." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    await evaluateOperationalPreflight(process.env, normalizeOperationalEvidence(body.operationalEvidence)),
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
