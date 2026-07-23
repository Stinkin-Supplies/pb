"use client";

import { useMemo, useState, useEffect } from "react";
import { useCart } from "@/components/CartContext";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { applyMapPricing } from "@/lib/map/engine";

const supabase = createBrowserSupabaseClient();

export default function CheckoutPage() {
  const { cartItems } = useCart();

  const [points, setPoints] = useState(0);
  const availablePoints = 2840;
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [ship, setShip] = useState({
    full_name: "",
    address1: "",
    address2: "",
    city: "",
    state: "",
    zip: "",
    country: "US",
  });
  const [shipmentBusy, setShipmentBusy] = useState(false);
  const [shipmentToast, setShipmentToast] = useState(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  const [shippingOption, setShippingOption] = useState("standard");
  const [routingResult, setRoutingResult] = useState(null);
  const [routingLoading, setRoutingLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("user_addresses")
        .select("*")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false });
      if (!mounted) return;
      setAddresses(data ?? []);
      const def = (data ?? []).find(a => a.is_default) ?? (data ?? [])[0];
      if (def) {
        setSelectedAddressId(def.id);
        setShip(s => ({
          ...s,
          full_name: `${def.first_name ?? ""} ${def.last_name ?? ""}`.trim(),
          address1: def.address1 ?? "",
          address2: def.address2 ?? "",
          city: def.city ?? "",
          state: def.state ?? "",
          zip: def.zip ?? "",
          country: def.country ?? "US",
        }));
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!cartItems.length) return;
    let cancelled = false;
    const fetchRouting = async () => {
      setRoutingLoading(true);
      try {
        const res = await fetch("/api/routing/offers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: cartItems.map((item) => ({
              sku: item.id ?? item.sku,
              qty: item.qty,
              retailPrice: item.price,
              name: item.name,
            })),
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setRoutingResult(data);
      } catch (e) {
        console.warn("[routing] fetch failed:", e);
      } finally {
        if (!cancelled) setRoutingLoading(false);
      }
    };
    fetchRouting();
    return () => { cancelled = true; };
  }, [cartItems]);

  const showShipmentToast = (msg) => {
    setShipmentToast(msg);
    setTimeout(() => setShipmentToast(null), 2200);
  };

  const splitName = (full) => {
    const parts = String(full ?? "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { first: "", last: "" };
    if (parts.length === 1) return { first: parts[0], last: "" };
    return { first: parts[0], last: parts.slice(1).join(" ") };
  };

  const refreshAddresses = async (userId) => {
    const { data } = await supabase
      .from("user_addresses")
      .select("*")
      .eq("user_id", userId)
      .order("is_default", { ascending: false });
    setAddresses(data ?? []);
  };

  const handleSaveAddress = async () => {
    if (shipmentBusy) return;
    setShipmentBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/auth"; return; }
      const { first, last } = splitName(ship.full_name);
      const payload = {
        user_id: user.id,
        first_name: first, last_name: last,
        address1: ship.address1, address2: ship.address2,
        city: ship.city, state: ship.state, zip: ship.zip,
        country: ship.country || "US",
      };
      const { error } = await supabase.from("user_addresses").insert(payload);
      if (error) { showShipmentToast("Could not save"); return; }
      await refreshAddresses(user.id);
      showShipmentToast("Saved to account");
    } finally { setShipmentBusy(false); }
  };

  const handleUseAddress = async () => {
    if (shipmentBusy) return;
    setShipmentBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/auth"; return; }
      let addressId = selectedAddressId;
      if (!addressId) {
        const { first, last } = splitName(ship.full_name);
        const { data: created, error: createErr } = await supabase
          .from("user_addresses")
          .insert({
            user_id: user.id,
            first_name: first, last_name: last,
            address1: ship.address1, address2: ship.address2,
            city: ship.city, state: ship.state, zip: ship.zip,
            country: ship.country || "US",
            is_default: true,
          })
          .select("id")
          .single();
        if (createErr || !created?.id) { showShipmentToast("Could not apply"); return; }
        addressId = created.id;
        setSelectedAddressId(addressId);
      }
      await supabase.from("user_addresses").update({ is_default: false }).eq("user_id", user.id);
      const { error: defErr } = await supabase
        .from("user_addresses").update({ is_default: true }).eq("id", addressId);
      if (defErr) { showShipmentToast("Could not apply"); return; }
      await refreshAddresses(user.id);
      showShipmentToast("Applied to order");
    } finally { setShipmentBusy(false); }
  };

  // ── Calculations ──────────────────────────────────────────────────────────
  const pointsValue = points * 0.01;
  const mapResult = applyMapPricing(
    cartItems.map(item => ({
      id: item.id, price: item.price, qty: item.qty, map_floor: item.map_floor,
    })),
    pointsValue
  );
  const subtotal = mapResult.subtotal;
  const pointsDiscount = mapResult.appliedDiscount;
  const standardShipping = subtotal >= 99 ? 0 : 5.99;
  const expressUpsell = 8.99;
  const shipping = shippingOption === "express" ? standardShipping + expressUpsell : standardShipping;
  const tax = subtotal * 0.07;
  const total = Math.max(mapResult.finalTotal + shipping + tax, 0);
  const toCents = (v) => Math.round(v * 100);

  const handleCheckout = async () => {
    if (checkoutLoading) return;
    setCheckoutLoading(true);
    setCheckoutError("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const customerEmail = user?.email ?? null;
      const { data: profile } = await supabase
        .from("user_profiles").select("first_name, last_name").eq("id", user?.id ?? "").single();
      const profileName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || null;
      const shippingAddress = {
        line1: ship.address1, line2: ship.address2 || null,
        city: ship.city, state: ship.state, postal_code: ship.zip, country: ship.country || "US",
      };
      const payload = {
        customer_email: customerEmail,
        customer_name: profileName || ship.full_name || null,
        shipping_address: shippingAddress, billing_address: shippingAddress,
        subtotal: toCents(subtotal), shipping: toCents(shipping),
        shipping_option: shippingOption,
        routing_vendor: routingResult?.cartVendor ?? null,
        split_required: routingResult?.splitRequired ?? false,
        tax: toCents(tax), discount: toCents(pointsDiscount),
        points_redeemed: points, points_redeemed_value: toCents(pointsValue),
        total: toCents(total),
        items: cartItems.map((item) => ({
          product_id: item.id, name: item.name, price: toCents(item.price), qty: item.qty,
        })),
      };

      const orderRes = await fetch("/api/checkout/create-order", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const orderText = await orderRes.text();
      let orderJson = null;
      try { orderJson = JSON.parse(orderText); } catch (e) {}
      if (!orderRes.ok || !orderJson?.order_id) {
        setCheckoutError(orderJson?.error || orderText || "Unknown error");
        setCheckoutLoading(false);
        return;
      }

      const sessionRes = await fetch("/api/checkout/create-session", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderJson.order_id, amount_cents: Math.round(total * 100) }),
      });
      const sessionJson = await sessionRes.json();
      if (!sessionRes.ok || !sessionJson?.url) {
        setCheckoutError(sessionJson?.error || "Unknown error");
        setCheckoutLoading(false);
        return;
      }
      window.location.href = sessionJson.url;
    } catch (err) {
      const message = err && typeof err === "object" && "message" in err ? err.message : "Unknown error";
      setCheckoutError(`Checkout failed: ${message}`);
    } finally {
      setCheckoutLoading(false);
    }
  };

  // ── Today's date for the receipt ─────────────────────────────────────────
  const today = new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });

  if (!cartItems.length) {
    return (
      <div style={{ background: 'var(--coal)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-tanker)', fontSize: 48, color: '#f5f0e8', textTransform: 'uppercase', marginBottom: 12 }}>
            Cart is empty
          </div>
          <a href="/browse" style={{ fontFamily: 'var(--font-stencil)', fontSize: 10, color: '#c9a84c', letterSpacing: '0.12em', textDecoration: 'none', textTransform: 'uppercase' }}>
            ← Browse Parts
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--coal)', minHeight: '100vh', padding: 'clamp(24px, 4vw, 56px) clamp(16px, 3vw, 32px) 80px' }}>

      {/* ── Page ident row ── */}
      <div style={{ maxWidth: 1160, margin: '0 auto 36px', display: 'flex', alignItems: 'center', gap: 20 }}>
        <span style={{ fontFamily: 'var(--font-stencil)', fontSize: 9, letterSpacing: '0.16em', color: 'rgba(197,167,34,0.55)', textTransform: 'uppercase', flexShrink: 0 }}>
          STINKIN&apos; SUPPLIES
        </span>
        <span style={{ flex: 1, height: 1, background: 'rgba(197,167,34,0.18)' }} />
        <span style={{ fontFamily: 'var(--font-tanker)', fontSize: 'clamp(24px, 3vw, 40px)', color: '#f5f0e8', textTransform: 'uppercase', letterSpacing: '0.02em', flexShrink: 0 }}>
          Checkout
        </span>
        <span style={{ flex: 1, height: 1, background: 'rgba(197,167,34,0.18)' }} />
        <span style={{ fontFamily: 'var(--font-stencil)', fontSize: 9, letterSpacing: '0.16em', color: 'rgba(197,167,34,0.35)', textTransform: 'uppercase', flexShrink: 0 }}>
          PARTS ORDER
        </span>
      </div>

      <div className="co-grid">

        {/* ══ LEFT: Carbon copy receipt ══ */}
        <div className="co-receipt-wrap">
          <div className="co-receipt">

            {/* Perforated top edge */}
            <div className="co-perf co-perf-top" />

            {/* Receipt header */}
            <div className="co-receipt-header">
              <div className="co-receipt-logo">STINKIN&apos; SUPPLIES</div>
              <div className="co-receipt-addr">AUTHORIZED H-D AFTERMARKET PARTS</div>
              <div className="co-receipt-addr">DAYTONA BEACH, FL  ·  (386) 555-0148</div>
            </div>

            <div className="co-receipt-rule" />

            {/* Work order meta */}
            <div className="co-receipt-meta">
              <div>
                <span className="co-meta-label">PARTS WORK ORDER</span>
              </div>
              <div>
                <span className="co-meta-label">DATE:</span>
                <span className="co-meta-value"> {today}</span>
              </div>
            </div>

            <div className="co-receipt-rule" />

            {/* Column headers */}
            <div className="co-line-head">
              <span style={{ flex: '0 0 28px' }}>QTY</span>
              <span style={{ flex: 1 }}>DESCRIPTION</span>
              <span style={{ flex: '0 0 68px', textAlign: 'right' }}>UNIT</span>
              <span style={{ flex: '0 0 72px', textAlign: 'right' }}>TOTAL</span>
            </div>

            <div className="co-receipt-rule" />

            {/* Line items */}
            <div className="co-items">
              {cartItems.map((item) => (
                <div key={item.id} className="co-line-item">
                  <span style={{ flex: '0 0 28px' }}>{item.qty}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.name}
                  </span>
                  <span style={{ flex: '0 0 68px', textAlign: 'right' }}>${item.price.toFixed(2)}</span>
                  <span style={{ flex: '0 0 72px', textAlign: 'right' }}>${(item.price * item.qty).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="co-receipt-rule" />

            {/* Totals */}
            <div className="co-totals">
              <div className="co-total-row">
                <span className="co-total-label">SUBTOTAL</span>
                <span className="co-total-val">${subtotal.toFixed(2)}</span>
              </div>
              <div className="co-total-row">
                <span className="co-total-label">
                  SHIPPING{shippingOption === "express" ? " (EXPRESS)" : ""}
                </span>
                <span className="co-total-val">
                  {shipping === 0 ? "FREE" : `$${shipping.toFixed(2)}`}
                </span>
              </div>
              <div className="co-total-row">
                <span className="co-total-label">TAX (7%)</span>
                <span className="co-total-val">${tax.toFixed(2)}</span>
              </div>
              {pointsDiscount > 0 && (
                <div className="co-total-row co-total-row--discount">
                  <span className="co-total-label">POINTS DISCOUNT</span>
                  <span className="co-total-val">−${pointsDiscount.toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* Grand total box */}
            <div className="co-grand-total">
              <span className="co-grand-label">ORDER TOTAL</span>
              <span className="co-grand-val">${total.toFixed(2)}</span>
            </div>

            {/* CTA */}
            <button
              className="co-pay-btn"
              onClick={handleCheckout}
              disabled={checkoutLoading}
            >
              {checkoutLoading ? "REDIRECTING..." : "PROCEED TO PAYMENT →"}
            </button>

            {checkoutError && (
              <div className="co-error">{checkoutError}</div>
            )}

            <div className="co-receipt-rule" style={{ marginTop: 20 }} />

            {/* Receipt footer */}
            <div className="co-receipt-footer">
              <div>● RETAIN THIS COPY FOR YOUR RECORDS</div>
              <div style={{ marginTop: 4 }}>THANK YOU FOR YOUR BUSINESS</div>
            </div>

            {/* Perforated bottom edge */}
            <div className="co-perf co-perf-bottom" />
          </div>
        </div>

        {/* ══ RIGHT: Dark form panels ══ */}
        <div className="co-forms">

          {/* ── Shipment info ── */}
          <div className="co-card">
            <div className="co-card-title">SHIPMENT INFO</div>

            {addresses.length > 0 && (
              <>
                <div className="co-label">SAVED ADDRESSES</div>
                <select
                  className="co-select"
                  value={selectedAddressId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedAddressId(id);
                    const addr = addresses.find(a => String(a.id) === id);
                    if (addr) {
                      setShip(s => ({
                        ...s,
                        full_name: `${addr.first_name ?? ""} ${addr.last_name ?? ""}`.trim(),
                        address1: addr.address1 ?? "", address2: addr.address2 ?? "",
                        city: addr.city ?? "", state: addr.state ?? "",
                        zip: addr.zip ?? "", country: addr.country ?? "US",
                      }));
                    }
                  }}
                >
                  {addresses.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.address1 ?? "Address"} — {a.city ?? ""} {a.state ?? ""}
                    </option>
                  ))}
                </select>
                <div style={{ height: 12 }} />
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <button className="co-btn" onClick={handleUseAddress} style={{ flex: 1 }}>
                    {shipmentBusy ? "WORKING..." : "USE THIS →"}
                  </button>
                  <button className="co-btn co-btn-ghost" onClick={handleSaveAddress} style={{ flex: 1 }}>
                    {shipmentBusy ? "WORKING..." : "SAVE TO ACCOUNT"}
                  </button>
                </div>
              </>
            )}

            <div className="co-label">FULL NAME</div>
            <input
              className="co-input"
              placeholder="John Doe"
              value={ship.full_name}
              onChange={(e) => setShip(s => ({ ...s, full_name: e.target.value }))}
            />
            <div style={{ height: 10 }} />

            <div className="co-label">STREET ADDRESS</div>
            <AddressAutocomplete
              placeholder="123 Main St"
              onSelect={(parsed) => setShip(s => ({
                ...s, address1: parsed.address_line1, city: parsed.city,
                state: parsed.state, zip: parsed.zip, country: parsed.country || "US",
              }))}
              onChange={(val) => setShip(s => ({ ...s, address1: val }))}
            />
            <div style={{ height: 10 }} />

            <div className="co-label">APT / SUITE</div>
            <input
              className="co-input"
              placeholder="Apt 4B (optional)"
              value={ship.address2}
              onChange={(e) => setShip(s => ({ ...s, address2: e.target.value }))}
            />
            <div style={{ height: 10 }} />

            <div className="co-label">CITY</div>
            <input
              className="co-input"
              placeholder="Palm Coast"
              value={ship.city}
              onChange={(e) => setShip(s => ({ ...s, city: e.target.value }))}
            />
            <div style={{ height: 10 }} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div className="co-label">STATE</div>
                <input
                  className="co-input"
                  placeholder="FL"
                  maxLength={2}
                  value={ship.state}
                  onChange={(e) => setShip(s => ({ ...s, state: e.target.value.toUpperCase() }))}
                />
              </div>
              <div>
                <div className="co-label">ZIP</div>
                <input
                  className="co-input"
                  placeholder="32137"
                  value={ship.zip}
                  onChange={(e) => setShip(s => ({ ...s, zip: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* ── Shipping method ── */}
          <div className="co-card">
            <div className="co-card-title">SHIPPING METHOD</div>
            {routingLoading && (
              <div className="co-muted" style={{ marginBottom: 10 }}>
                CHECKING AVAILABILITY...
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Standard */}
              <div
                className={`co-ship-opt${shippingOption === "standard" ? " co-ship-opt--on" : ""}`}
                onClick={() => setShippingOption("standard")}
                role="radio"
                aria-checked={shippingOption === "standard"}
              >
                <div className="co-ship-dot">
                  {shippingOption === "standard" && <div className="co-ship-dot-fill" />}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="co-ship-name">STANDARD GROUND</div>
                  <div className="co-ship-eta">3 – 5 BUSINESS DAYS</div>
                </div>
                {standardShipping === 0
                  ? <span className="co-free-badge">FREE</span>
                  : <div className="co-ship-price">${standardShipping.toFixed(2)}</div>
                }
              </div>

              {/* Express */}
              <div
                className={`co-ship-opt${shippingOption === "express" ? " co-ship-opt--on" : ""}`}
                onClick={() => setShippingOption("express")}
                role="radio"
                aria-checked={shippingOption === "express"}
              >
                <div className="co-ship-dot">
                  {shippingOption === "express" && <div className="co-ship-dot-fill" />}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="co-ship-name">EXPRESS</div>
                  <div className="co-ship-eta">1 – 2 BUSINESS DAYS</div>
                </div>
                <div className="co-ship-price">${(standardShipping + expressUpsell).toFixed(2)}</div>
              </div>
            </div>
            {routingResult?.splitRequired && (
              <div className="co-muted" style={{ marginTop: 10, color: '#c9a84c' }}>
                YOUR ORDER SHIPS FROM MULTIPLE LOCATIONS
              </div>
            )}
          </div>

          {/* ── Points ── */}
          <div className="co-card">
            <div className="co-card-title">REDEEM POINTS</div>
            <div className="co-label">AVAILABLE BALANCE</div>
            <div className="co-muted" style={{ marginBottom: 10 }}>
              {availablePoints.toLocaleString()} PTS
            </div>
            <div className="co-label">POINTS TO APPLY</div>
            <input
              type="number"
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
              className="co-input"
              min={0}
              max={availablePoints}
            />
            <div className="co-muted" style={{ marginTop: 6 }}>
              {points} PTS = ${pointsValue.toFixed(2)} DISCOUNT
            </div>
            {mapResult.appliedDiscount < pointsValue && (
              <div className="co-muted" style={{ marginTop: 4, color: '#c9a84c' }}>
                DISCOUNT LIMITED BY MAP PRICING RULES
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Toast ── */}
      {shipmentToast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#c9a84c', color: '#1a1208',
          fontFamily: 'var(--font-stencil)', fontSize: 10, letterSpacing: '0.12em',
          padding: '10px 20px', zIndex: 999,
        }}>
          {shipmentToast.toUpperCase()}
        </div>
      )}

      <style>{`
        .co-grid {
          max-width: 1160px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 420px 1fr;
          gap: 32px;
          align-items: start;
        }

        /* ── Receipt ── */
        .co-receipt-wrap {
          position: sticky;
          top: 32px;
        }
        .co-receipt {
          background: #faf7ee;
          position: relative;
          box-shadow:
            0 2px 0 rgba(0,0,0,0.06),
            0 8px 32px rgba(0,0,0,0.28),
            0 1px 0 rgba(139,110,44,0.15);
          /* Subtle ruled-line texture — like lined paper */
          background-image:
            linear-gradient(
              transparent,
              transparent 23px,
              rgba(0,0,80,0.04) 23px,
              rgba(0,0,80,0.04) 24px
            );
          background-size: 100% 24px;
        }
        .co-perf {
          height: 16px;
          background:
            radial-gradient(circle at 50% 0%, var(--coal) 6px, transparent 6px) top center / 18px 9px repeat-x,
            #faf7ee;
          position: relative;
        }
        .co-perf-bottom {
          background:
            radial-gradient(circle at 50% 100%, var(--coal) 6px, transparent 6px) bottom center / 18px 9px repeat-x,
            #faf7ee;
        }
        .co-receipt-header {
          text-align: center;
          padding: 4px 28px 16px;
        }
        .co-receipt-logo {
          font-family: var(--font-tanker), sans-serif;
          font-size: 22px;
          letter-spacing: 0.06em;
          color: #1a1208;
          text-transform: uppercase;
          line-height: 1;
          margin-bottom: 6px;
        }
        .co-receipt-addr {
          font-family: var(--font-stencil), monospace;
          font-size: 9px;
          letter-spacing: 0.10em;
          color: #6a5a3a;
          text-transform: uppercase;
          line-height: 1.6;
        }
        .co-receipt-rule {
          border: none;
          border-top: 1px dashed rgba(139,110,44,0.35);
          margin: 0 28px;
        }
        .co-receipt-meta {
          display: flex;
          justify-content: space-between;
          padding: 10px 28px;
        }
        .co-meta-label {
          font-family: var(--font-stencil), monospace;
          font-size: 9px;
          letter-spacing: 0.12em;
          color: #6a5a3a;
          text-transform: uppercase;
        }
        .co-meta-value {
          font-family: var(--font-stencil), monospace;
          font-size: 9px;
          letter-spacing: 0.08em;
          color: #2a2010;
        }
        .co-line-head {
          display: flex;
          gap: 8px;
          padding: 8px 28px;
          font-family: var(--font-stencil), monospace;
          font-size: 8px;
          letter-spacing: 0.12em;
          color: #8a7050;
          text-transform: uppercase;
        }
        .co-items {
          padding: 4px 28px 4px;
        }
        .co-line-item {
          display: flex;
          gap: 8px;
          padding: 5px 0;
          font-family: var(--font-stencil), monospace;
          font-size: 11px;
          letter-spacing: 0.04em;
          color: #2a2010;
          border-bottom: 1px solid rgba(139,110,44,0.10);
        }
        .co-line-item:last-child { border-bottom: none; }
        .co-totals {
          padding: 10px 28px 6px;
        }
        .co-total-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 5px;
          font-family: var(--font-stencil), monospace;
          font-size: 10px;
          letter-spacing: 0.08em;
          color: #5a4a2a;
        }
        .co-total-row--discount { color: #7a5810; }
        .co-total-label {}
        .co-total-val { font-variant-numeric: tabular-nums; }
        .co-grand-total {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin: 12px 28px 16px;
          padding: 10px 14px;
          border: 2px solid #c9a84c;
          background: rgba(201,168,76,0.06);
        }
        .co-grand-label {
          font-family: var(--font-stencil), monospace;
          font-size: 11px;
          letter-spacing: 0.12em;
          color: #3a2a10;
          text-transform: uppercase;
        }
        .co-grand-val {
          font-family: var(--font-tanker), sans-serif;
          font-size: 28px;
          color: #1a1208;
          letter-spacing: 0.03em;
          font-variant-numeric: tabular-nums;
        }
        .co-pay-btn {
          display: block;
          width: calc(100% - 56px);
          margin: 0 28px;
          padding: 14px;
          background: #1a1208;
          border: 2px solid #1a1208;
          color: #c9a84c;
          font-family: var(--font-stencil), monospace;
          font-size: 12px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }
        .co-pay-btn:hover:not(:disabled) {
          background: #c9a84c;
          border-color: #c9a84c;
          color: #1a1208;
        }
        .co-pay-btn:disabled { opacity: 0.7; cursor: not-allowed; }
        .co-error {
          margin: 8px 28px 0;
          font-family: var(--font-stencil), monospace;
          font-size: 9px;
          letter-spacing: 0.08em;
          color: #c05050;
        }
        .co-receipt-footer {
          padding: 10px 28px 4px;
          font-family: var(--font-stencil), monospace;
          font-size: 8px;
          letter-spacing: 0.10em;
          color: #8a7050;
          text-transform: uppercase;
          text-align: center;
          line-height: 1.7;
        }

        /* ── Form panels (right side, dark) ── */
        .co-forms {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .co-card {
          background: #0e0b06;
          border: 1px solid rgba(197,167,34,0.16);
          padding: 22px 24px;
        }
        .co-card-title {
          font-family: var(--font-tanker), sans-serif;
          font-size: 18px;
          letter-spacing: 0.06em;
          color: #f5f0e8;
          text-transform: uppercase;
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid rgba(197,167,34,0.12);
        }
        .co-label {
          font-family: var(--font-stencil), monospace;
          font-size: 8px;
          letter-spacing: 0.14em;
          color: rgba(197,167,34,0.45);
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        .co-input {
          width: 100%;
          height: 42px;
          background: #080604;
          border: 1px solid rgba(197,167,34,0.18);
          color: #f5f0e8;
          font-family: var(--font-body), sans-serif;
          font-size: 14px;
          padding: 0 12px;
          border-radius: 0;
          outline: none;
          box-sizing: border-box;
          margin-bottom: 0;
          transition: border-color 0.15s;
        }
        .co-input:focus { border-color: #c9a84c; }
        .co-select {
          width: 100%;
          height: 42px;
          background: #080604;
          border: 1px solid rgba(197,167,34,0.18);
          color: #f5f0e8;
          font-family: var(--font-body), sans-serif;
          font-size: 14px;
          padding: 0 12px;
          border-radius: 0;
          outline: none;
          appearance: none;
          box-sizing: border-box;
        }
        .co-muted {
          font-family: var(--font-stencil), monospace;
          font-size: 9px;
          letter-spacing: 0.10em;
          color: #706860;
        }
        .co-btn {
          height: 40px;
          background: #c9a84c;
          border: 1px solid #b8963a;
          color: #1a1208;
          font-family: var(--font-stencil), monospace;
          font-size: 10px;
          letter-spacing: 0.12em;
          cursor: pointer;
          border-radius: 0;
          text-transform: uppercase;
          transition: background 0.15s;
        }
        .co-btn:hover { background: #b8963a; }
        .co-btn-ghost {
          background: transparent;
          border-color: rgba(197,167,34,0.35);
          color: #a09890;
        }
        .co-btn-ghost:hover { background: rgba(197,167,34,0.06); border-color: #c9a84c; color: #c9a84c; }

        /* Shipping option tiles */
        .co-ship-opt {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 16px;
          background: #080604;
          border: 1px solid rgba(197,167,34,0.14);
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
          user-select: none;
        }
        .co-ship-opt:hover { border-color: rgba(197,167,34,0.35); }
        .co-ship-opt--on { border-color: #c9a84c; background: rgba(201,168,76,0.05); }
        .co-ship-dot {
          width: 14px; height: 14px; flex-shrink: 0;
          border: 2px solid rgba(197,167,34,0.30);
          display: flex; align-items: center; justify-content: center;
          transition: border-color 0.15s;
        }
        .co-ship-opt--on .co-ship-dot { border-color: #c9a84c; }
        .co-ship-dot-fill {
          width: 6px; height: 6px;
          background: #c9a84c;
        }
        .co-ship-name {
          font-family: var(--font-stencil), monospace;
          font-size: 11px; letter-spacing: 0.10em; color: #f5f0e8;
        }
        .co-ship-eta {
          font-family: var(--font-stencil), monospace;
          font-size: 8px; letter-spacing: 0.10em; color: #706860; margin-top: 3px;
        }
        .co-ship-price {
          font-family: var(--font-tanker), sans-serif;
          font-size: 16px; letter-spacing: 0.03em; color: #a09890; flex-shrink: 0;
        }
        .co-ship-opt--on .co-ship-price { color: #c9a84c; }
        .co-free-badge {
          font-family: var(--font-stencil), monospace;
          font-size: 8px; letter-spacing: 0.12em; color: #5a9a5a;
          padding: 2px 7px; border: 1px solid #5a9a5a;
        }

        @media (max-width: 900px) {
          .co-grid { grid-template-columns: 1fr; }
          .co-receipt-wrap { position: static; }
        }
      `}</style>
    </div>
  );
}
