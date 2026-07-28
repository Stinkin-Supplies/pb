'use client';

import { useState } from 'react';
import { useCartSafe } from '@/components/CartContext';

const GOLD  = '#c9a84c';
const BORDER = '#e6dcc0';
const INK   = '#1a1208';

/** Qty stepper + Add to Cart, wired to the real cart context. */
export default function AddToCartBar({ product }) {
  const { addItem } = useCartSafe();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  // checkout/prepare rejects items with no canonical_sku — keep the button
  // disabled rather than let a bad add reach checkout (see CartContext.jsx).
  const canAdd = Boolean(product.canonical_sku);

  function handleAdd() {
    if (!canAdd) return;
    addItem(product, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
      {/* Qty stepper */}
      <div style={{
        display: 'flex', alignItems: 'center',
        border: `1px solid ${BORDER}`, flexShrink: 0,
      }}>
        <button
          onClick={() => setQty(q => Math.max(1, q - 1))}
          aria-label="Decrease quantity"
          style={{
            width: 38, height: 52, background: '#fff', border: 'none',
            fontSize: 18, color: INK, cursor: 'pointer',
          }}
        >
          −
        </button>
        <div style={{
          width: 44, textAlign: 'center',
          fontFamily: 'var(--font-stencil)', fontSize: 15, color: INK,
        }}>
          {qty}
        </div>
        <button
          onClick={() => setQty(q => q + 1)}
          aria-label="Increase quantity"
          style={{
            width: 38, height: 52, background: '#fff', border: 'none',
            fontSize: 18, color: INK, cursor: 'pointer',
          }}
        >
          +
        </button>
      </div>

      {/* Add to cart */}
      <button
        onClick={handleAdd}
        disabled={!canAdd}
        style={{
          flex: 1,
          height: 52,
          padding: '0 24px',
          background: added ? '#3f7a3f' : GOLD,
          border: `2px solid ${added ? '#3f7a3f' : '#b8963a'}`,
          borderRadius: 0,
          fontFamily: 'var(--font-tanker)',
          fontSize: 18,
          letterSpacing: '0.10em',
          color: canAdd ? INK : '#8a8070',
          cursor: canAdd ? 'pointer' : 'not-allowed',
          opacity: canAdd ? 1 : 0.6,
          textTransform: 'uppercase',
          transition: 'background 0.15s, border-color 0.15s',
        }}
        title={canAdd ? undefined : 'This product is not yet available for checkout'}
      >
        {added ? '✓ Added' : canAdd ? 'Add to Cart' : 'Unavailable'}
      </button>
    </div>
  );
}
