import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(req) {
  if (!process.env.STRIPE_SECRET_KEY || !webhookSecret) {
    return new NextResponse("Missing Stripe env vars", { status: 500 });
  }

  const body = await req.text(); // MUST be raw text for signature verification
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return new NextResponse("Missing signature", { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed.", err?.message || err);
    return new NextResponse("Invalid signature", { status: 400 });
  }

  switch (event.type) {
    case "payment_intent.succeeded": {
      const paymentIntent = event.data.object;
      console.log("Payment succeeded:", paymentIntent.id);
      // TODO: create order in DB here
      break;
    }
    case "payment_intent.payment_failed": {
      console.log("Payment failed");
      break;
    }
    default:
      break;
  }

  return new NextResponse("OK", { status: 200 });
}
