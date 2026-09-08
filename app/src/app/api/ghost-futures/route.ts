import { NextResponse } from "next/server";
import { geometryReleaseResponse } from "@/server/geometry/releaseResponse";
import { getPlanGeometry, isTemplateId } from "@/server/geometry/registry";
import { previewGhostFuture, previewGhostFutures } from "@/server/rules/ghostFutures";
import { isTokenPlacement, type TokenPlacement } from "@/server/rules/tokens";

interface GhostFuturesRequestBody {
  templateId?: string;
  compassDeg?: number;
  floor?: number;
  placements?: TokenPlacement[];
  candidates?: TokenPlacement[];
}

const MAX_CANDIDATES = 6;

export async function POST(request: Request) {
  let body: GhostFuturesRequestBody;
  try {
    body = (await request.json()) as GhostFuturesRequestBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!body?.templateId || !isTemplateId(body.templateId)) {
    return NextResponse.json(
      { error: "templateId must be one of: tampines-greenweave, tengah-5room, resale-exec-1990s." },
      { status: 400 },
    );
  }

  if (typeof body.compassDeg !== "number" || !Number.isFinite(body.compassDeg)) {
    return NextResponse.json({ error: "compassDeg is required and must be a number." }, { status: 400 });
  }

  if (typeof body.floor !== "number" || !Number.isFinite(body.floor) || body.floor < 1) {
    return NextResponse.json({ error: "floor is required and must be 1 or higher." }, { status: 400 });
  }

  if (body.candidates !== undefined && (!Array.isArray(body.candidates) || body.candidates.length > MAX_CANDIDATES)) {
    return NextResponse.json({ error: "candidates must include up to 6 token placements." }, { status: 400 });
  }

  if (body.candidates?.some((candidate) => !isTokenPlacement(candidate))) {
    return NextResponse.json(
      { error: "each candidate must include tokenId and point { x, y } in plan meters." },
      { status: 400 },
    );
  }

  const placements = body.placements ?? [];
  if (!Array.isArray(placements)) {
    return NextResponse.json({ error: "placements must be an array of token placements." }, { status: 400 });
  }

  if (placements.some((placement) => !isTokenPlacement(placement))) {
    return NextResponse.json(
      { error: "each placement must include tokenId and point { x, y } in plan meters." },
      { status: 400 },
    );
  }

  const blocked = geometryReleaseResponse(body.templateId);
  if (blocked) return blocked;
  const plan = getPlanGeometry(body.templateId);
  const base = {
    plan,
    compassDeg: body.compassDeg as number,
    floor: body.floor as number,
    placements,
  };
  const futures =
    body.candidates && body.candidates.length > 0
      ? body.candidates.map((candidate) =>
          previewGhostFuture({
            ...base,
            candidate,
          }),
        )
      : previewGhostFutures(base);

  return NextResponse.json({ futures });
}
