import { NextResponse } from "next/server";
import { getPlanGeometry, isTemplateId } from "@/server/geometry/registry";
import { isTokenPlacement, validateTokenPlacement, type TokenPlacement } from "@/server/rules/tokens";

interface TokenValidationRequestBody {
  templateId?: string;
  placement?: TokenPlacement;
}

export async function POST(request: Request) {
  const body = (await request.json()) as TokenValidationRequestBody;

  if (!body.templateId || !isTemplateId(body.templateId)) {
    return NextResponse.json(
      { error: "templateId must be one of: tampines-greenweave, tengah-5room, resale-exec-1990s." },
      { status: 400 },
    );
  }

  if (!isTokenPlacement(body.placement)) {
    return NextResponse.json(
      { error: "placement must include tokenId and point { x, y } in plan meters." },
      { status: 400 },
    );
  }

  return NextResponse.json(validateTokenPlacement(getPlanGeometry(body.templateId), body.placement));
}
