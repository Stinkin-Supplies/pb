"use client";
// ============================================================
// components/CartRoot.jsx
// ============================================================
// Thin client shell that:
//   1. Wraps the whole app in CartProvider
//   2. Renders CartDrawer globally (so it works on every page)
//
// Lives in layout.jsx so it's mounted once for the whole app.
// Must be "use client" because CartProvider uses useState/useEffect.
// ============================================================

import { CartProvider, useCart } from "./CartContext";
import CartDrawer from "./CartDrawer";

// Inner component so it can useCart() which requires CartProvider above it
function CartDrawerMount() {
  const { cartItems, isOpen, setIsOpen, updateQty, removeItem, pointsBalance } = useCart();
  return (
    <CartDrawer
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      cartItems={cartItems}
      onUpdateQty={updateQty}
      onRemove={removeItem}
      pointsBalance={pointsBalance}
    />
  );
}

export default function CartRoot({ children }) {
  return (
    <CartProvider>
      {children}
      <CartDrawerMount/>
    </CartProvider>
  );
}