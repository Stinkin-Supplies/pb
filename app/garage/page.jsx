// app/garage/page.jsx  —  SERVER COMPONENT
// Fetches user's saved vehicles from Supabase server-side.
// Protected by middleware — user is guaranteed to be logged in.

import { createServerClient } from "@supabase/ssr";
import { cookies }             from "next/headers";
import { redirect }            from "next/navigation";
import GarageClient            from "./GarageClient";

export const metadata = {
  title: "My Garage | Stinkin' Supplies",
};

export default async function GaragePage() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll()      { return cookieStore.getAll(); },
        setAll(toSet) { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  // Fetch user profile
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("first_name, last_name, points_balance, referral_code, created_at")
    .eq("id", user.id)
    .single();

  // Fetch saved vehicles
  const { data: vehicles } = await supabase
    .from("user_garage")
    .select("id, year, make, model, trim, nickname, is_primary, created_at")
    .eq("user_id", user.id)
    .order("is_primary", { ascending: false });

  return (
    <GarageClient
      user={{
        id:        user.id,
        email:     user.email,
        firstName: profile?.first_name ?? "",
        lastName:  profile?.last_name  ?? "",
        points:    profile?.points_balance ?? 0,
        referral:  profile?.referral_code  ?? null,
        memberSince: profile?.created_at   ?? user.created_at,
      }}
      initialVehicles={vehicles ?? []}
    />
  );
}