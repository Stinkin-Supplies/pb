// app/auth/callback/route.js
// ============================================================
// Handles Supabase auth redirects:
//   - Magic link clicks from email
//   - OAuth provider callbacks (Google etc.)
//   - Email confirmation links
//
// Supabase redirects to /auth/callback?code=xxx after auth.
// This route exchanges the code for a session then redirects
// the user to their intended destination.
// ============================================================

import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code     = searchParams.get("code");
  const next     = searchParams.get("next") ?? "/garage";
  const errorParam = searchParams.get("error");

  // Handle error redirects from Supabase
  if (errorParam) {
    console.error("[auth/callback] Supabase error:", errorParam);
    return NextResponse.redirect(`${origin}/auth?error=${encodeURIComponent(errorParam)}`);
  }

  if (code) {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Successful auth — redirect to garage (or intended destination)
      return NextResponse.redirect(`${origin}${next}`);
    }

    console.error("[auth/callback] exchangeCodeForSession failed:", error.message);
  }

  // Fallback — something went wrong, back to auth page
  return NextResponse.redirect(`${origin}/auth?error=auth_callback_failed`);
}
