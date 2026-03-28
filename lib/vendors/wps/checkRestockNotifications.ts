// lib/vendors/wps/checkRestockNotifications.ts
// ─────────────────────────────────────────────
// After each flushBatch, check if any newly in-stock SKUs
// have waiting notifications — flag them for the cron to send.

import { createClient } from "@supabase/supabase-js";

export async function checkRestockNotifications(
  upsertedSkus: { sku: string; in_stock: boolean }[]
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Only care about SKUs that came back IN stock
  const backInStock = upsertedSkus
    .filter((p) => p.in_stock === true)
    .map((p) => p.sku);

  if (backInStock.length === 0) return 0;

  // Flag matching waiting notifications as notified_pending
  const { data, error } = await supabase
    .from("stock_notifications")
    .update({ status: "notified_pending" })
    .in("product_sku", backInStock)
    .eq("status", "waiting")
    .select("id");

  if (error) {
    console.warn("[Restock] Failed to flag notifications:", error.message);
    return 0;
  }

  const count = data?.length ?? 0;
  if (count > 0) {
    console.log(`[Restock] Flagged ${count} notifications as notified_pending`);
  }
  return count;
}