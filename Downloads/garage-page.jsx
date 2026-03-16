// app/garage/page.jsx  —  SERVER COMPONENT
// Unified "My Garage" — fetches all user data in parallel.
// Tabs: Profile · Bikes · Points · Wishlist · Orders

import { createServerClient } from "@supabase/ssr";
import { cookies }             from "next/headers";
import { redirect }            from "next/navigation";
import GarageHub               from "./GarageHub";

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

  const [
    { data: profile },
    { data: addresses },
    { data: garageRows },
    { data: ledger },
    { data: wishlistRows },
    { data: orders },
  ] = await Promise.all([
    supabase.from("user_profiles").select("*").eq("id", user.id).single(),
    supabase.from("user_addresses").select("*").eq("user_id", user.id).order("is_default", { ascending: false }),
    supabase.from("user_garage").select("id, nickname, is_primary, added_at, vehicles(id, year, make, model, submodel, type)").eq("user_id", user.id).order("is_primary", { ascending: false }),
    supabase.from("points_ledger").select("id, points, type, description, created_at, expires_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    supabase.from("wishlists").select("id, added_at, notify_in_stock, products(id, slug, name, price, brand_name, stock_quantity)").eq("user_id", user.id).order("added_at", { ascending: false }),
    supabase.from("orders").select("id, created_at, status, total_amount, order_line_items(id, quantity, unit_price, products(name, slug))").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
  ]);

  const vehicles = (garageRows ?? []).map(r => ({
    id: r.id, vehicleId: r.vehicles?.id,
    year: r.vehicles?.year, make: r.vehicles?.make,
    model: r.vehicles?.model, submodel: r.vehicles?.submodel,
    type: r.vehicles?.type ?? "motorcycle",
    nickname: r.nickname, is_primary: r.is_primary, added_at: r.added_at,
  }));

  const wishlist = (wishlistRows ?? []).map(r => ({
    wishlistId: r.id, addedAt: r.added_at, notifyInStock: r.notify_in_stock,
    id: r.products?.id, slug: r.products?.slug, name: r.products?.name,
    price: Number(r.products?.price ?? 0),
    brand: r.products?.brand_name ?? "Unknown",
    inStock: (r.products?.stock_quantity ?? 0) > 0,
  }));

  return (
    <GarageHub
      user={{
        id: user.id, email: user.email,
        firstName:    profile?.first_name     ?? "",
        lastName:     profile?.last_name      ?? "",
        phone:        profile?.phone          ?? "",
        points:       profile?.points_balance ?? 0,
        lifetimeSpend:profile?.lifetime_spend ?? 0,
        orderCount:   profile?.order_count    ?? 0,
        referral:     profile?.referral_code  ?? null,
        memberSince:  profile?.created_at     ?? user.created_at,
      }}
      initialAddresses={addresses ?? []}
      initialVehicles={vehicles}
      ledger={ledger ?? []}
      wishlist={wishlist}
      orders={orders ?? []}
    />
  );
}
