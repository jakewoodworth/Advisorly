import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { password } = (await req.json().catch(() => ({}))) as { password?: string };
    const expected = process.env.DEMO_PASSWORD || "";
    if (!password || password !== expected) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true });
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    res.cookies.set("demo_auth", "1", {
      httpOnly: true,
      sameSite: "lax",
      expires,
      path: "/",
    });
    return res;
  } catch (err) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
