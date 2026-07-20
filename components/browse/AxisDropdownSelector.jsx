'use client';
// components/browse/AxisDropdownSelector.jsx
//
// Generic N-axis dropdown selector, driven by each variant's `options[]`
// array (catalog_variant_member_options via the variants API) rather than
// the legacy option_1/2 columns. Renders one native <select> per axis name
// present across variants — a single "Length" axis for brake/clutch lines
// today, extensible to multi-axis cases (e.g. Angle + Color + Length for
// brake fittings) later without changing this component's core logic.

import { useState } from 'react';

const BORDER = '#e0d8c8';
const DARK   = '#2a1f0e';

function axisNamesOf(variants) {
  const seen = [];
  for (const v of variants) {
    for (const o of v.options ?? []) {
      if (!seen.includes(o.name)) seen.push(o.name);
    }
  }
  return seen;
}

function valueOf(variant, axisName) {
  return variant.options?.find((o) => o.name === axisName)?.value ?? null;
}

// Numeric-aware sort: 10.85" before 13.2", 9" before 10" — plain string
// sort would put "10" before "9".
function sortValues(values) {
  return [...values].sort((a, b) => {
    const na = parseFloat(a);
    const nb = parseFloat(b);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return a.localeCompare(b);
  });
}

export default function AxisDropdownSelector({ variants, currentId, onSelect }) {
  const axisNames = axisNamesOf(variants);
  const current = variants.find((v) => v.id === currentId) ?? variants[0];

  const [selections, setSelections] = useState(() => {
    const init = {};
    for (const name of axisNames) init[name] = valueOf(current, name);
    return init;
  });

  // Best SKU for a given set of axis selections — in-stock preferred, then
  // cheapest. Same tie-break convention as ColorQtySelector.bestVariant,
  // generalized from a fixed color+qty pair to N named axes.
  function bestVariant(sel) {
    const matches = variants.filter((v) => axisNames.every((name) => valueOf(v, name) === sel[name]));
    if (!matches.length) return null;
    const inStock = matches.filter((v) => v.stock_qty > 0);
    const pool = inStock.length ? inStock : matches;
    return pool.reduce((best, v) => {
      const p  = parseFloat(v.offer_price || v.msrp || 0);
      const bp = parseFloat(best.offer_price || best.msrp || 0);
      return p < bp ? v : best;
    });
  }

  function handleChange(axisName, value) {
    const next = { ...selections, [axisName]: value };
    setSelections(next);
    const v = bestVariant(next);
    if (v) onSelect(v);
  }

  const activeVariant = bestVariant(selections);
  const activePrice   = activeVariant ? parseFloat(activeVariant.offer_price || activeVariant.msrp || 0) : null;
  const activeStock   = activeVariant?.stock_qty ?? 0;

  const selectStyle = {
    width: '100%',
    padding: '10px 32px 10px 12px',
    borderRadius: 6,
    border: `1px solid ${BORDER}`,
    background: 'white',
    color: DARK,
    fontFamily: "var(--font-stencil,'Barlow Condensed',monospace)",
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: '0.04em',
    cursor: 'pointer',
    appearance: 'none',
    WebkitAppearance: 'none',
    backgroundImage:
      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path d='M2 4L6 8L10 4' stroke='%236b5c40' stroke-width='1.5' fill='none' stroke-linecap='round'/></svg>\")",
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
  };

  return (
    <div style={{ padding: '14px 14px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {axisNames.map((axisName) => {
        const values = sortValues([...new Set(variants.map((v) => valueOf(v, axisName)).filter(Boolean))]);
        return (
          <div key={axisName}>
            <label
              htmlFor={`axis-select-${axisName}`}
              style={{
                display: 'block',
                fontFamily: "var(--font-stencil,'Barlow Condensed',monospace)",
                fontSize: 9, letterSpacing: '0.14em', color: '#9a8870',
                textTransform: 'uppercase', marginBottom: 8,
              }}
            >
              {axisName}
            </label>
            <select
              id={`axis-select-${axisName}`}
              value={selections[axisName] ?? ''}
              onChange={(e) => handleChange(axisName, e.target.value)}
              style={selectStyle}
            >
              {values.map((val) => {
                const candidate  = bestVariant({ ...selections, [axisName]: val });
                const inStock    = candidate?.stock_qty > 0;
                const priceLabel = candidate
                  ? `$${parseFloat(candidate.offer_price || candidate.msrp || 0).toFixed(2)}`
                  : null;
                return (
                  <option key={val} value={val}>
                    {val}{priceLabel ? ` — ${priceLabel}` : ''}{candidate && !inStock ? ' (out of stock)' : ''}
                  </option>
                );
              })}
            </select>
          </div>
        );
      })}

      {activeVariant && (
        <div
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '8px 12px',
            background: '#f5f0e8', border: `1px solid ${BORDER}`, borderRadius: 6,
            fontFamily: "var(--font-stencil,'Barlow Condensed',monospace)",
          }}
        >
          <span style={{ fontSize: 11, color: '#6b5c40', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {activeVariant.sku}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 9, color: activeStock > 0 ? '#4a8c5c' : '#b05a40', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {activeStock > 0 ? 'In stock' : 'Out of stock'}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: DARK }}>
              {activePrice != null ? `$${activePrice.toFixed(2)}` : '—'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
