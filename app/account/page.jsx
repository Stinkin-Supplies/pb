// app/account/page.jsx  —  SERVER COMPONENT
import { createServerClient } from "@supabase/ssr";
import { cookies }             from "next/headers";
import { redirect }            from "next/navigation";
import AccountClient           from "./AccountClient";

export const metadata = { title: "My Account | Stinkin' Supplies" };

export default async function AccountPage() {
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
    .select("*")
    .eq("id", user.id)
    .single();

  const { data: addresses } = await supabase
    .from("user_addresses")
    .select("*")
    .eq("user_id", user.id)
    .order("is_default", { ascending: false });

  return (
    <AccountClient
      user={{
        id:          user.id,
        email:       user.email,
        firstName:   profile?.first_name    ?? "",
        lastName:    profile?.last_name     ?? "",
        phone:       profile?.phone         ?? "",
        points:      profile?.points_balance ?? 0,
        role:        profile?.role           ?? "customer",
        memberSince: profile?.created_at     ?? user.created_at,
      }}
      initialAddresses={addresses ?? []}
    />
  );
}
