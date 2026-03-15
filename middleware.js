import { NextResponse } from "next/server";

const PROTECTED = ["/garage", "/account", "/checkout", "/order"];

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Skip the auth callback route entirely
  if (pathname.startsWith("/auth/callback")) return NextResponse.next();

  const isProtected = PROTECTED.some(r => pathname.startsWith(r));

  // Check for any sb- cookie (Supabase session indicator)
  const allCookies = request.cookies.getAll();
  const isLoggedIn = allCookies.some(c =>
    c.name.includes("auth-token") || c.name.includes("sb-")
  );

  if (isProtected && !isLoggedIn) {
    const url = new URL("/auth", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // DON'T redirect logged-in users away from /auth here —
  // let the auth page's useEffect handle that to avoid loops
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|images).*)"],
};
