import { NextResponse } from "next/server";
import { validateExpectedRenderAssets } from "@/server/validation/renderAssets";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await validateExpectedRenderAssets());
}
