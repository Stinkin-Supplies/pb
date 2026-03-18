import { createClient } from "@supabase/supabase-js";
import { formatMoney } from "@/lib/utils/money";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function OrderPage({ params }) {
  const { id } = params;

  // 🔥 Fetch order
  const { data: order, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !order) {
    return <div className="p-10 text-white">Order not found.</div>;
  }

  // 🔥 Fetch items
  const { data: items } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", id);

  // 🔥 Timeline helper
  const timeline = [
    { label: "Order Placed", time: order.created_at },
    {
      label: "Payment Confirmed",
      time: order.updated_at,
    },
    {
      label: "Processing",
      time: order.status === "processing" ? order.updated_at : null,
    },
  ];

  return (
    <div className="min-h-screen bg-black text-white p-10 space-y-10">
      {/* HEADER */}
      <div className="border-b border-gray-800 pb-6">
        <h1 className="text-3xl font-bold">Order #{order.id.slice(0, 8)}</h1>
        <p className="text-sm text-gray-400">
          Status: <span className="text-green-400">{order.status}</span>
        </p>
      </div>

      {/* ITEMS */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Items</h2>

        {items?.length ? (
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex justify-between border border-gray-800 p-4 rounded"
              >
                <div>
                  <p>{item.quantity}× {item.name}</p>
                </div>
                <p>{formatMoney(item.price)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No items found.</p>
        )}
      </div>

      {/* SUMMARY */}
      <div className="border border-gray-800 p-6 rounded space-y-2">
        <h2 className="text-xl font-semibold">Summary</h2>
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatMoney(order.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>Shipping</span>
          <span>{formatMoney(order.shipping)}</span>
        </div>
        <div className="flex justify-between">
          <span>Tax</span>
          <span>{formatMoney(order.tax)}</span>
        </div>
        <div className="flex justify-between font-bold text-lg">
          <span>Total</span>
          <span>{formatMoney(order.total)}</span>
        </div>
      </div>

      {/* TIMELINE */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Timeline</h2>
        <div className="space-y-3">
          {timeline.map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <div>
                <p>{step.label}</p>
                {step.time && (
                  <p className="text-xs text-gray-500">
                    {new Date(step.time).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SHIPPING */}
      <div className="grid grid-cols-2 gap-6">
        <div className="border border-gray-800 p-4 rounded">
          <h3 className="font-semibold mb-2">Shipping</h3>
          <p>{order.shipping_address?.line1}</p>
          <p>
            {order.shipping_address?.city}, {order.shipping_address?.state}
          </p>
          <p>{order.shipping_address?.postal_code}</p>
          <p>{order.shipping_address?.country}</p>
        </div>

        <div className="border border-gray-800 p-4 rounded">
          <h3 className="font-semibold mb-2">Billing</h3>
          <p>{order.billing_address?.line1}</p>
          <p>
            {order.billing_address?.city}, {order.billing_address?.state}
          </p>
          <p>{order.billing_address?.postal_code}</p>
          <p>{order.billing_address?.country}</p>
        </div>
      </div>
    </div>
  );
}