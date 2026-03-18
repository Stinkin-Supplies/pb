import { createClient } from "@supabase/supabase-js";
import { formatMoney } from "@/lib/utils/money";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function SuccessPage({ searchParams }) {
  const params = await searchParams;
  console.log("PARAMS:", params);
  const orderId = params?.order_id;
  console.log("ORDER ID:", orderId);

  if (!orderId) {
    return <div>No order ID provided.</div>;
  }

  const { data: order, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();
  console.log("ORDER DATA:", order);
  console.log("FETCH ERROR:", error);

  if (error || !order) {
    return <div>Order not found.</div>;
  }

  let orderItems = [];
  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", orderId);
  if (!itemsError && items?.length) {
    orderItems = items;
  } else {
    const { data: lineItems, error: lineError } = await supabase
      .from("order_line_items")
      .select("*")
      .eq("order_id", orderId);
    if (!lineError && lineItems?.length) {
      orderItems = lineItems;
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold">🎉 Order Confirmed</h1>
        <p className="text-gray-500 mt-2">
          Thank you for your purchase
        </p>
        <p className="mt-2 text-sm text-gray-400">
          Order #{order.order_number || order.id}
        </p>
        <p className="mt-1 text-green-600 font-medium">
          Status: {order.status}
        </p>
      </div>
  
      {/* Items */}
      <div className="bg-white shadow rounded-2xl p-6">
        <h2 className="text-lg font-semibold mb-4">Items</h2>
  
        {orderItems.length === 0 ? (
          <p className="text-gray-500">No items found.</p>
        ) : (
          <div className="space-y-3">
            {orderItems.map((item) => (
              <div
                key={item.id ?? `${item.name}-${item.quantity}`}
                className="flex justify-between border-b pb-2"
              >
                <div>
                  <p className="font-medium">
                    {item.name ?? "Item"}
                  </p>
                  <p className="text-sm text-gray-500">
                    Qty: {item.quantity ?? 1}
                  </p>
                </div>
  
                <p>
                  {formatMoney(item.unit_price ?? item.price ?? 0)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
  
      {/* Summary */}
      <div className="bg-white shadow rounded-2xl p-6">
        <h2 className="text-lg font-semibold mb-4">Summary</h2>
  
        <div className="space-y-2 text-sm">
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
  
          <div className="flex justify-between font-bold text-lg mt-3">
            <span>Total</span>
            <span>{formatMoney(order.total)}</span>
          </div>
        </div>
      </div>
  
      {/* Addresses */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white shadow rounded-2xl p-6">
          <h3 className="font-semibold mb-2">Shipping</h3>
          {order.shipping_address ? (
            <>
              <p>{order.shipping_address.line1}</p>
              {order.shipping_address.line2 && (
                <p>{order.shipping_address.line2}</p>
              )}
              <p>
                {order.shipping_address.city},{" "}
                {order.shipping_address.state}{" "}
                {order.shipping_address.postal_code}
              </p>
              <p>{order.shipping_address.country}</p>
            </>
          ) : (
            <p className="text-gray-500">No address</p>
          )}
        </div>
  
        <div className="bg-white shadow rounded-2xl p-6">
          <h3 className="font-semibold mb-2">Billing</h3>
          {order.billing_address ? (
            <>
              <p>{order.billing_address.line1}</p>
              {order.billing_address.line2 && (
                <p>{order.billing_address.line2}</p>
              )}
              <p>
                {order.billing_address.city},{" "}
                {order.billing_address.state}{" "}
                {order.billing_address.postal_code}
              </p>
              <p>{order.billing_address.country}</p>
            </>
          ) : (
            <p className="text-gray-500">Same as shipping</p>
          )}
        </div>
      </div>
  
      {/* CTA */}
      <div className="text-center">
        <a
          href="/shop"
          className="inline-block mt-4 px-6 py-3 bg-black text-white rounded-xl hover:opacity-90"
        >
          Continue Shopping
        </a>
      </div>
    </div>
  );
}
