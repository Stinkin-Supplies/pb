// app/api/cron/restock-notify/route.ts
// ─────────────────────────────────────
// Picks up notified_pending stock_notifications and sends
// restock emails via Resend. Runs on a Vercel cron schedule.

export const runtime = "nodejs";

import { NextResponse }  from "next/server";
import { createClient }  from "@supabase/supabase-js";
import { Resend }        from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM   = "Stinkin' Supplies <no-reply@stinkinsupplies.com>"; // update to your domain

export async function GET(req: Request) {
  // Vercel cron auth
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Grab all pending notifications
  const { data: pending, error } = await supabase
    .from("stock_notifications")
    .select("*")
    .eq("status", "notified_pending")
    .limit(100); // process in batches of 100

  if (error) {
    console.error("[Restock Cron] Failed to fetch pending:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!pending || pending.length === 0) {
    return NextResponse.json({ sent: 0, message: "Nothing pending" });
  }

  let sent = 0;
  let failed = 0;

  for (const notif of pending) {
    try {
      const productUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/products/${notif.product_sku}`;

      await resend.emails.send({
        from:    FROM,
        to:      notif.email,
        subject: `✅ Back in Stock — ${notif.product_name}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #e8621a;">Good news — it's back!</h2>
            <p>An item on your radar is back in stock:</p>

            <div style="border: 1px solid #eee; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <h3 style="margin: 0 0 8px;">${notif.product_name}</h3>
              <p style="margin: 0; color: #666;">SKU: ${notif.product_sku}</p>
              ${notif.current_price
                ? `<p style="margin: 8px 0 0; font-size: 20px; font-weight: bold; color: #e8621a;">
                    $${notif.current_price}
                   </p>`
                : ""
              }
            </div>

            <a href="${productUrl}"
               style="display: inline-block; background: #e8621a; color: white;
                      padding: 12px 28px; border-radius: 4px; text-decoration: none;
                      font-weight: bold;">
              View Product
            </a>

            <p style="margin-top: 32px; font-size: 12px; color: #999;">
              You're receiving this because you requested a restock alert on
              stinkinsupplies.com. 
              <a href="${process.env.NEXT_PUBLIC_SITE_URL}/account/notifications">
                Manage alerts
              </a>
            </p>
          </div>
        `,
      });

      // Mark as notified
      await supabase
        .from("stock_notifications")
        .update({
          status:      "notified",
          notified_at: new Date().toISOString(),
        })
        .eq("id", notif.id);

      sent++;
    } catch (err: any) {
      console.error(`[Restock Cron] Failed to send for ${notif.email}:`, err.message);
      failed++;
      // Leave as notified_pending so next cron run retries it
    }
  }

  console.log(`[Restock Cron] Sent: ${sent} | Failed: ${failed}`);
  return NextResponse.json({ sent, failed });
}