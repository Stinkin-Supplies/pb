// app/garage/page.jsx  —  SERVER COMPONENT
import { createServerClient } from "@supabase/ssr";
import { cookies }             from "next/headers";
import { redirect }            from "next/navigation";
import GarageClient            from "./GarageClient";

export const metadata = { title: "My Garage | Stinkin' Supplies" };

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

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("first_name, last_name, points_balance, referral_code, created_at")
    .eq("id", user.id)
    .single();

  // Join user_garage → vehicles for year/make/model
  const { data: garageRows } = await supabase
    .from("user_garage")
    .select("id, nickname, is_primary, mileage, color, added_at, vehicles(id, year, make, model, submodel)")
    .eq("user_id", user.id)
    .order("is_primary", { ascending: false });

  // Flatten the join so GarageClient gets simple objects
  const vehicles = (garageRows ?? []).map(row => ({
    id:         row.id,
    vehicleId:  row.vehicles?.id    ?? null,
    year:       row.vehicles?.year  ?? "",
    make:       row.vehicles?.make  ?? "",
    model:      row.vehicles?.model ?? "",
    submodel:   row.vehicles?.submodel ?? null,
    nickname:   row.nickname,
    mileage:    row.mileage,
    color:      row.color,
    is_primary: row.is_primary,
    added_at:   row.added_at,
  }));

  return (
    <GarageClient
      user={{
        id:          user.id,
        email:       user.email,
        firstName:   profile?.first_name    ?? "",
        lastName:    profile?.last_name     ?? "",
        points:      profile?.points_balance ?? 0,
        referral:    profile?.referral_code  ?? null,
        memberSince: profile?.created_at     ?? user.created_at,
      }}
      initialVehicles={vehicles}
    />
  );
}