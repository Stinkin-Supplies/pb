const GUEST_CART_KEY = "guest_cart_v1";
type GuestCartItem = { product_id: string; quantity: number };

export function getGuestCart(): GuestCartItem[] {
  try {
    const raw = localStorage.getItem(GUEST_CART_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function setGuestCart(items: GuestCartItem[]) {
  localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items));
}

export function clearGuestCart() {
  localStorage.removeItem(GUEST_CART_KEY);
}

export function addToGuestCart(product_id: string, quantity = 1) {
  const items: GuestCartItem[] = getGuestCart();
  const idx = items.findIndex((i) => i.product_id === product_id);
  if (idx === -1) items.push({ product_id, quantity });
  else items[idx].quantity += quantity;
  setGuestCart(items);
  return items;
}
