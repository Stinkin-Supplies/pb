import { NextResponse } from "next/server";
import Stripe from "stripe";

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

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-02-25.clover",
    });

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
    }

    return new NextResponse("OK", { status: 200 });
  } catch (err) {
    console.error("WEBHOOK CRASH:", err);
    return new NextResponse("Error", { status: 500 });
  }
}
