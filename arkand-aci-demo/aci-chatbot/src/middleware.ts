import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const hasAuth = req.cookies.get("demo_auth")?.value;
  if (!hasAuth) {
    const url = new URL("/demo-login", req.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/demo/:path*", "/demo", "/admin/:path*", "/admin"],
};
