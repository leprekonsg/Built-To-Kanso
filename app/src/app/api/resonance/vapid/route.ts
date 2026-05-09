import { NextResponse } from "next/server";

export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;

  if (!publicKey) {
    return NextResponse.json(
      { error: "vapid_unconfigured", message: "Set VAPID_PUBLIC_KEY in env" },
      { status: 503 },
    );
  }

  return NextResponse.json({ publicKey });
}
