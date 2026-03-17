"use client";

import { useMemo, useState } from "react";
import { useCart } from "@/components/CartContext";

export default function CheckoutPage() {
  const { cartItems } = useCart();

  const [points, setPoints] = useState(0);

  // 🔹 Calculations
  const subtotal = useMemo(() => {
    return cartItems.reduce(
      (acc, item) => acc + Number(item.price) * item.qty,
      0
    );
  }, [cartItems]);

  const shipping = subtotal >= 99 ? 0 : 5;
  const tax = subtotal * 0.07;

  const pointsValue = points * 0.01;

  const totalBeforeClamp = subtotal + shipping + tax - pointsValue;

  const total = Math.max(totalBeforeClamp, 0);

  if (!cartItems.length) {
    return <div className="p-6">Your cart is empty</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-8">

      {/* LEFT */}
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Checkout</h1>

        {/* Points */}
        <div>
          <h2 className="font-semibold mb-2">Redeem Points</h2>
          <input
            type="number"
            value={points}
            onChange={(e) => setPoints(Number(e.target.value))}
            className="input"
          />
          <p className="text-sm text-gray-500">
            {points} pts = ${pointsValue.toFixed(2)}
          </p>
        </div>
      </div>

      {/* RIGHT */}
      <div className="border rounded-2xl p-6 space-y-4">
        <h2 className="text-xl font-semibold">Order Summary</h2>

        {cartItems.map((item) => (
          <div key={item.id} className="flex justify-between text-sm">
            <span>{item.name} x{item.qty}</span>
            <span>${(item.price * item.qty).toFixed(2)}</span>
          </div>
        ))}

        <hr />

        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>${subtotal.toFixed(2)}</span>
        </div>

        <div className="flex justify-between">
          <span>Shipping</span>
          <span>${shipping.toFixed(2)}</span>
        </div>

        <div className="flex justify-between">
          <span>Tax</span>
          <span>${tax.toFixed(2)}</span>
        </div>

        <div className="flex justify-between text-red-500">
          <span>Points Discount</span>
          <span>- ${pointsValue.toFixed(2)}</span>
        </div>

        <hr />

        <div className="flex justify-between font-bold text-lg">
          <span>Total</span>
          <span>${total.toFixed(2)}</span>
        </div>

        <button
          className="w-full bg-black text-white py-3 rounded-xl"
          onClick={() => alert("Next: MAP enforcement")}
        >
          Continue
        </button>
      </div>
    </div>
  );
}