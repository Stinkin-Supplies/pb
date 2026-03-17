import { NextResponse } from "next/server";
import Stripe from "stripe";
import { applyMapPricing } from "@/lib/map/engine";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

export async function POST(req) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "Missing STRIPE_SECRET_KEY" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const items = Array.isArray(body?.items) ? body.items : [];
    const points = Number(body?.points ?? 0);

    if (items.length === 0) {
      return NextResponse.json(
        { error: "No items provided" },
        { status: 400 }
      );
    }

    const pointsValue = points * 0.01;

    const mapResult = applyMapPricing(
      items.map((item) => ({
        id: String(item.id),
        price: Number(item.price) || 0,
        qty: Number(item.qty) || 0,
        map_floor: item.map_floor == null ? undefined : Number(item.map_floor),
      })),
      pointsValue
    );

    // Match checkout rules for shipping + tax
    const shipping = mapResult.subtotal >= 99 ? 0 : 5;
    const tax = mapResult.subtotal * 0.07;
    const total = Math.max(mapResult.finalTotal + shipping + tax, 0);
    const amount = Math.round(total * 100);

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "Invalid amount" },
        { status: 400 }
      );
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: {
        items: JSON.stringify(items),
        points: String(points),
      },
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (err) {
    console.error("Stripe error:", err);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
