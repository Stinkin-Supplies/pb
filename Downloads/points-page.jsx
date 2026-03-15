// app/account/points/page.jsx  —  SERVER COMPONENT
import { createServerClient } from "@supabase/ssr";
import { cookies }             from "next/headers";
import { redirect }            from "next/navigation";
import PointsClient            from "./PointsClient";

export const metadata = { title: "Points & Rewards | Stinkin' Supplies" };

export default async function PointsPage() {
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
    .select("points_balance, lifetime_spend, order_count")
    .eq("id", user.id)
    .single();

  // Points ledger history
  const { data: ledger } = await supabase
    .from("points_ledger")
    .select("id, points, type, description, created_at, expires_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <PointsClient
      user={{ id: user.id, email: user.email }}
      points={profile?.points_balance ?? 0}
      lifetimeSpend={profile?.lifetime_spend ?? 0}
      orderCount={profile?.order_count ?? 0}
      ledger={ledger ?? []}
    />
  );
}
