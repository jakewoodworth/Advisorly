import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const demoExpiry = process.env.DEMO_EXPIRY || null;
  return NextResponse.json({ demoExpiry });
}
