import { NextResponse } from "next/server";
import { geometryReleaseResponse } from "@/server/geometry/releaseResponse";
import { getPlanGeometry, isTemplateId } from "@/server/geometry/registry";
import { generateHouseChangelog } from "@/server/rules/changelog";
import { isTokenPlacement, type TokenPlacement } from "@/server/rules/tokens";

interface ChangelogRequestBody {
  templateId?: string;
  placements?: TokenPlacement[];
}

export async function POST(request: Request) {
  let body: ChangelogRequestBody;
  try { body = await request.json() as ChangelogRequestBody; }
  catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }

  if (!body?.templateId || !isTemplateId(body.templateId)) {
    return NextResponse.json(
      { error: "templateId must be one of: tampines-greenweave, tengah-5room, resale-exec-1990s." },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.placements)) {
    return NextResponse.json({ error: "placements must be an array of token placements." }, { status: 400 });
  }

  const invalidPlacement = body.placements.find((placement) => !isTokenPlacement(placement));
  if (invalidPlacement) {
    return NextResponse.json(
      { error: "each placement must include tokenId and point { x, y } in plan meters." },
      { status: 400 },
    );
  }

  const blocked = geometryReleaseResponse(body.templateId);
  if (blocked) return blocked;
  return NextResponse.json(
    generateHouseChangelog({
      plan: getPlanGeometry(body.templateId),
      placements: body.placements,
    }),
  );
}
