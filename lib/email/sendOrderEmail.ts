type OrderWithItems = {
  id?: string;
  customer_email?: string | null;
  customer_name?: string | null;
  total?: number | null;
  order_items?: Array<{
    id?: string;
    name?: string | null;
    price?: number | null;
    qty?: number | null;
  }>;
};

export async function sendOrderEmail(order: OrderWithItems) {
  // Placeholder: wire to your email provider later (Resend, Postmark, etc.)
  // This keeps the webhook working without failing builds.
  console.log("EMAIL: sendOrderEmail called for order", {
    id: order?.id,
    email: order?.customer_email,
  });
}
