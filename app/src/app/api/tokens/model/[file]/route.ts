import { NextResponse } from "next/server";
import { readTokenVisualModel, tokenVisualModelHeaders } from "@/server/tokens/visuals";

interface RouteContext {
  params: Promise<{ file: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { file } = await context.params;
  const model = await readTokenVisualModel(file);

  if (!model) {
    return NextResponse.json(
      { error: "Unknown token GLB. Generate it again through /api/tokens/generate." },
      { status: 404, headers: { "X-Token-Visual-Only": "true" } },
    );
  }

  return new NextResponse(new Uint8Array(model), {
    status: 200,
    headers: tokenVisualModelHeaders(),
  });
}
