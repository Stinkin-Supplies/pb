import { createClient } from "@supabase/supabase-js";

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

  return (
    <div style={{ padding: "40px" }}>
      <h1>🎉 Order Confirmed</h1>

      <p><strong>Order ID:</strong> {order.id}</p>
      <p><strong>Status:</strong> {order.status}</p>
      <p><strong>Total:</strong> ${order.total_amount}</p>

      <h3>Customer</h3>
      <p>{order.customer_name || "Guest"}</p>
      <p>{order.customer_email || "No email"}</p>

      <h3>Shipping</h3>
      <p>{order.shipping_address || "No address provided"}</p>
    </div>
  );
}
