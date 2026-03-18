import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const orderId = body?.order_id;
    const amountCents = Number(body?.amount_cents ?? 0);
    const amountDollars = Number(body?.amount ?? 0);
    const resolvedAmountCents =
      Number.isFinite(amountCents) && amountCents > 0
        ? amountCents
        : Math.round(amountDollars * 100);

    if (
      !orderId ||
      !Number.isFinite(resolvedAmountCents) ||
      resolvedAmountCents <= 0
    ) {
      return NextResponse.json(
        { error: "Invalid payload" },
        { status: 400 }
      );
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Order",
            },
            unit_amount: Math.round(resolvedAmountCents),
          },
          quantity: 1,
        },
      ],
      success_url: `${
        process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000"
      }/checkout/success?order_id=${orderId}`,
      cancel_url: `${
        process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000"
      }/checkout`,
      payment_intent_data: {
        metadata: {
          order_id: String(orderId),
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
