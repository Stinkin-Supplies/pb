import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED = ["/garage", "/account", "/checkout", "/order"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/auth/callback")) return NextResponse.next();

  const isPublic =
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/api/webhooks") ||
    pathname === "/";

  if (isPublic) return NextResponse.next();

  const isProtected = PROTECTED.some((route) => pathname.startsWith(route));

  const allCookies = request.cookies.getAll();
  const isLoggedIn = allCookies.some((cookie) =>
    cookie.name.includes("auth-token") || cookie.name.includes("sb-")
  );

  if (isProtected && !isLoggedIn) {
    const url = new URL("/auth", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|images).*)"],
};
