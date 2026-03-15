import { NextResponse } from "next/server";

const PROTECTED = ["/garage", "/account", "/checkout", "/order"];

export function middleware(request) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED.some(r => pathname.startsWith(r));

  if (isProtected) {
    const hasSbCookie = [...request.cookies.getAll()]
      .some(c => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"));
    if (!hasSbCookie) {
      const url = new URL("/auth", request.url);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  if (pathname === "/auth") {
    const hasSbCookie = [...request.cookies.getAll()]
      .some(c => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"));
    if (hasSbCookie) {
      return NextResponse.redirect(new URL("/garage", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|images).*)"],
};