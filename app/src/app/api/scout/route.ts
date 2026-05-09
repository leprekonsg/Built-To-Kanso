import { NextResponse } from "next/server";
import { getPlanGeometry, isTemplateId } from "@/server/geometry/registry";
import { runScoutPass } from "@/server/scout/scout";
import { isTokenPlacement, type TokenPlacement } from "@/server/rules/tokens";

interface ScoutRequestBody {
  templateId?: string;
  compassDeg?: number;
  floor?: number;
  tokenPlacements?: TokenPlacement[];
}

export async function POST(request: Request) {
  const body = (await request.json()) as ScoutRequestBody;

  if (!body.templateId || !isTemplateId(body.templateId)) {
    return NextResponse.json(
      { error: "templateId must be one of: tampines-greenweave, tengah-5room, resale-exec-1990s." },
      { status: 400 },
    );
  }

  const compassDeg = body.compassDeg;
  const floor = body.floor;

  if (typeof compassDeg !== "number" || !Number.isFinite(compassDeg)) {
    return NextResponse.json({ error: "compassDeg is required and must be a number." }, { status: 400 });
  }

  if (typeof floor !== "number" || !Number.isFinite(floor) || floor < 1) {
    return NextResponse.json({ error: "floor is required and must be 1 or higher." }, { status: 400 });
  }

  const tokenPlacements = body.tokenPlacements ?? [];
  if (!Array.isArray(tokenPlacements)) {
    return NextResponse.json({ error: "tokenPlacements must be an array of token placements." }, { status: 400 });
  }

  if (tokenPlacements.some((placement) => !isTokenPlacement(placement))) {
    return NextResponse.json(
      { error: "each token placement must include tokenId and point { x, y } in plan meters." },
      { status: 400 },
    );
  }

  const result = runScoutPass({
    plan: getPlanGeometry(body.templateId),
    compassDeg,
    floor,
    tokenPlacements,
  });

  return NextResponse.json(result);
}
