export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { sendOrderEmail } from "@/lib/email/sendOrderEmail";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    console.log("WEBHOOK HIT");

    const body = await req.text();
    const sig = req.headers.get("stripe-signature");

    if (!sig) {
      console.error("Missing stripe signature");
      return new NextResponse("Missing signature", { status: 400 });
    }

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      console.error("Missing webhook secret");
      return new NextResponse("Missing webhook secret", { status: 500 });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      console.error("Missing STRIPE_SECRET_KEY");
      return new NextResponse("Missing secret key", { status: 500 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err: any) {
      console.error("Signature verification failed:", err?.message || err);
      return new NextResponse("Invalid signature", { status: 400 });
    }

    console.log("Event:", event.type);

    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log("Payment success:", paymentIntent.id);
      if (!paymentIntent.latest_charge) {
        console.error("Missing latest_charge on payment intent");
        return new NextResponse("Missing latest_charge", { status: 500 });
      }

      const charge = await stripe.charges.retrieve(
        String(paymentIntent.latest_charge)
      );

      const orderId = paymentIntent.metadata?.order_id;
      if (!orderId) {
        console.error("Missing order_id in metadata");
        return new NextResponse("Missing order_id", { status: 400 });
      }

      const stripe_charge_id = charge.id;
      const payment_method_last4 =
        charge.payment_method_details?.card?.last4 || null;
      const order_id = orderId;

      const { error } = await supabaseAdmin
        .from("orders")
        .update({
          status: "processing",
          stripe_payment_intent_id: paymentIntent.id,
          stripe_charge_id,
          payment_method_last4,
        })
        .eq("id", order_id);

      if (error) {
        console.error("Order update failed:", error);
        return new NextResponse("Order update failed", { status: 500 });
      }

      const { data: order, error: orderError } = await supabaseAdmin
        .from("orders")
        .select(
          `
          *,
          order_items (*)
        `
        )
        .eq("id", order_id)
        .single();

      if (orderError) {
        console.error("Order fetch failed:", orderError);
        return new NextResponse("Order fetch failed", { status: 500 });
      }

      await sendOrderEmail(order);
    }

    return new NextResponse("OK", { status: 200 });
  } catch (err) {
    console.error("WEBHOOK CRASH:", err);
    return new NextResponse("Error", { status: 500 });
  }
}
