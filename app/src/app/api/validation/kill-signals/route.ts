import { NextResponse } from "next/server";
import { evaluateKillSignals, type KillSignalInput } from "@/server/validation/killSignals";

interface KillSignalRequestBody {
  feedback?: unknown;
  source?: unknown;
  studyId?: unknown;
}

const SOURCES = new Set(["user_study", "production_feedback", "demo_observation"]);
const MAX_FEEDBACK_ROWS = 200;

export async function GET() {
  return NextResponse.json({
    ready: true,
    acceptedSources: Array.from(SOURCES),
    maxFeedbackRows: MAX_FEEDBACK_ROWS,
    rules: evaluateKillSignals([]).map(({ id, action }) => ({ id, action })),
  });
}

export async function POST(request: Request) {
  let body: KillSignalRequestBody;
  try {
    body = (await request.json()) as KillSignalRequestBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const source = parseSource(body.source);
  if (typeof source === "string" && source.startsWith("error:")) {
    return NextResponse.json({ error: source.slice("error:".length) }, { status: 400 });
  }

  const feedback = parseFeedback(body.feedback);
  if (typeof feedback === "string") {
    return NextResponse.json({ error: feedback }, { status: 400 });
  }

  const results = evaluateKillSignals(feedback);
  const tripped = results.filter((result) => result.tripped);

  return NextResponse.json({
    ok: true,
    source,
    studyId: typeof body.studyId === "string" && body.studyId.trim() ? body.studyId.trim() : null,
    feedbackCount: feedback.length,
    trippedCount: tripped.length,
    results,
    nextActions: tripped.map((result) => ({ id: result.id, action: result.action })),
  });
}

function parseSource(value: unknown): string {
  if (value === undefined) return "user_study";
  if (typeof value !== "string" || !SOURCES.has(value)) {
    return `error:source must be one of: ${Array.from(SOURCES).join(", ")}.`;
  }
  return value;
}

function parseFeedback(value: unknown): KillSignalInput[] | string {
  if (!Array.isArray(value)) {
    return "feedback must be an array of { userId, text } entries.";
  }
  if (value.length === 0) {
    return "feedback must include at least one tester or user response.";
  }
  if (value.length > MAX_FEEDBACK_ROWS) {
    return `feedback must include ${MAX_FEEDBACK_ROWS} or fewer entries.`;
  }

  const parsed: KillSignalInput[] = [];
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) {
      return `feedback[${index}] must be an object with userId and text.`;
    }
    const userId = typeof entry.userId === "string" ? entry.userId.trim() : "";
    const text = typeof entry.text === "string" ? entry.text.trim() : "";
    if (!userId) return `feedback[${index}].userId is required.`;
    if (!text) return `feedback[${index}].text is required.`;
    parsed.push({ userId, text });
  }

  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
