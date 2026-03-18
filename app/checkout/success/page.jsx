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
    <div style={{ padding: "40px" }}>
      <h1>🎉 Order Confirmed</h1>

      <p><strong>Order ID:</strong> {order.id}</p>
      <p><strong>Status:</strong> {order.status}</p>
      <p><strong>Total:</strong> {formatMoney(order.total)}</p>

      <h3>Customer</h3>
      <p>{order.customer_name || "Guest"}</p>
      <p>{order.customer_email || "No email"}</p>

      <h3>Shipping</h3>
      {order.shipping_address ? (
        <div>
          <p>{order.shipping_address.line1}</p>
          {order.shipping_address.line2 && (
            <p>{order.shipping_address.line2}</p>
          )}
          <p>
            {order.shipping_address.city}, {order.shipping_address.state}{" "}
            {order.shipping_address.postal_code}
          </p>
          <p>{order.shipping_address.country}</p>
        </div>
      ) : (
        <p>No address provided</p>
      )}

      <h3>Billing</h3>
      {order.billing_address ? (
        <div>
          <p>{order.billing_address.line1}</p>
          {order.billing_address.line2 && (
            <p>{order.billing_address.line2}</p>
          )}
          <p>
            {order.billing_address.city}, {order.billing_address.state}{" "}
            {order.billing_address.postal_code}
          </p>
          <p>{order.billing_address.country}</p>
        </div>
      ) : (
        <p>Same as shipping</p>
      )}

      <h3>Items</h3>
      {orderItems.length === 0 ? (
        <p>No items found.</p>
      ) : (
        <ul>
          {orderItems.map((item) => (
            <li key={item.id ?? `${item.name}-${item.quantity}`}>
              {item.quantity ?? 1}× {item.name ?? "Item"} —{" "}
              {formatMoney(item.unit_price ?? item.price ?? 0)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
