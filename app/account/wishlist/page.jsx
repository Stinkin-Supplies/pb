// app/account/wishlist/page.jsx  —  SERVER COMPONENT
import { createServerClient } from "@supabase/ssr";
import { cookies }             from "next/headers";
import { redirect }            from "next/navigation";
import WishlistClient          from "./WishlistClient";

export const metadata = { title: "Wishlist | Stinkin' Supplies" };

export default async function WishlistPage() {
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

  // Join wishlist → products
  const { data: items } = await supabase
    .from("wishlists")
    .select("id, added_at, notify_in_stock, products(id, slug, name, price, brand_name, category_name, stock_quantity)")
    .eq("user_id", user.id)
    .order("added_at", { ascending: false });

  const normalized = (items ?? []).map(row => ({
    wishlistId:    row.id,
    addedAt:       row.added_at,
    notifyInStock: row.notify_in_stock,
    id:            row.products?.id,
    slug:          row.products?.slug,
    name:          row.products?.name,
    price:         Number(row.products?.price ?? 0),
    brand:         row.products?.brand_name ?? "Unknown",
    category:      row.products?.category_name ?? "",
    inStock:       (row.products?.stock_quantity ?? 0) > 0,
  }));

  return <WishlistClient userId={user.id} initialItems={normalized} />;
}
