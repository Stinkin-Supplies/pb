type CartItem = {
  id: string;
  price: number;
  qty: number;
  map_floor?: number;
};

type Result = {
  subtotal: number;
  mapSubtotal: number;
  allowedDiscount: number;
  appliedDiscount: number;
  finalTotal: number;
};

export function applyMapPricing(
  items: CartItem[],
  requestedDiscount: number
): Result {
  const subtotal = items.reduce(
    (acc, item) => acc + item.price * item.qty,
    0
  );

  const mapSubtotal = items.reduce(
    (acc, item) =>
      acc + (item.map_floor ?? item.price) * item.qty,
    0
  );

  const allowedDiscount = Math.max(subtotal - mapSubtotal, 0);
  const appliedDiscount = Math.min(requestedDiscount, allowedDiscount);
  const finalTotal = subtotal - appliedDiscount;

  return {
    subtotal,
    mapSubtotal,
    allowedDiscount,
    appliedDiscount,
    finalTotal,
  };
}
