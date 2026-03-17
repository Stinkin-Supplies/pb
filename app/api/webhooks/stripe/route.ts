export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

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
      const { customerEmail, customerName } = getCustomerInfo(paymentIntent);

      const items = [
        { product_id: null, name: "Test Product", price: 100, qty: 1 },
      ];

      const subtotal = 100;
      const shipping = 0;
      const tax = 0;
      const total = 100;

      let customer_email = customerEmail;
      let customer_name = customerName;
      const shipping_address = paymentIntent.shipping?.address ?? null;
      let billing_address: string | null = null;

      if (paymentIntent.latest_charge) {
        const charge = await stripe.charges.retrieve(
          String(paymentIntent.latest_charge)
        );
        const billing = charge.billing_details;
        if (billing?.address?.line1 && billing?.address?.city && billing?.address?.state) {
          billing_address = `${billing.address.line1}, ${billing.address.city}, ${billing.address.state}`;
        }
        if (billing?.email) customer_email = billing.email;
        if (billing?.name) customer_name = billing.name;
      }

      const amount = paymentIntent.amount;

      const test = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`,
        {
          headers: {
            apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
          },
        }
      );
      console.log("SUPABASE STATUS:", test.status);

      console.log("INSERTING ORDER WITH:", {
        customer_email,
        customer_name,
        shipping_address,
        billing_address,
        amount,
      });

      const { data: order, error } = await supabaseAdmin
        .from("orders")
        .insert({
          stripe_payment_intent_id: paymentIntent.id,
          subtotal,
          shipping,
          tax,
          total,
        })
        .select()
        .single();

      console.log("SUPABASE RESPONSE:", order, error);

      if (error) {
        console.error("Order insert failed:", JSON.stringify(error, null, 2));
        return new NextResponse("Order insert failed", { status: 500 });
      }

      console.log("Order created:", order.id);

      const orderItems = items.map((item) => ({
        order_id: order.id,
        ...item,
      }));

      const { error: itemsError } = await supabaseAdmin
        .from("order_items")
        .insert(orderItems);

      if (itemsError) {
        console.error("Order items insert failed:", itemsError);
        return new NextResponse("Order items insert failed", { status: 500 });
      }
    }

    return new NextResponse("OK", { status: 200 });
  } catch (err) {
    console.error("WEBHOOK CRASH:", err);
    return new NextResponse("Error", { status: 500 });
  }
}

function getCustomerInfo(paymentIntent: Stripe.PaymentIntent) {
  const customerEmail =
    paymentIntent.receipt_email ||
    paymentIntent.metadata?.customer_email ||
    "unknown@example.com";

  const customerName =
    paymentIntent.shipping?.name ||
    paymentIntent.metadata?.customer_name ||
    "Guest Customer";

  return { customerEmail, customerName };
}
