import { NextResponse } from "next/server";
import { getPlanGeometry, isTemplateId } from "@/server/geometry/registry";
import { generateHouseChangelog } from "@/server/rules/changelog";
import type { TokenId, TokenPlacement } from "@/server/rules/tokens";

interface ChangelogRequestBody {
  templateId?: string;
  placements?: TokenPlacement[];
}

const TOKEN_IDS: TokenId[] = ["wind_gate", "soft_screen", "wood_anchor", "solar_shield", "fan_anchor", "shaft_buffer"];

export async function POST(request: Request) {
  const body = (await request.json()) as ChangelogRequestBody;

  if (!body.templateId || !isTemplateId(body.templateId)) {
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

  return NextResponse.json(
    generateHouseChangelog({
      plan: getPlanGeometry(body.templateId),
      placements: body.placements,
    }),
  );
}

function isTokenPlacement(value: unknown): value is TokenPlacement {
  if (!value || typeof value !== "object") return false;

  const placement = value as Partial<TokenPlacement>;
  return (
    typeof placement.tokenId === "string" &&
    TOKEN_IDS.includes(placement.tokenId as TokenId) &&
    Number.isFinite(placement.point?.x) &&
    Number.isFinite(placement.point?.y)
  );
}
