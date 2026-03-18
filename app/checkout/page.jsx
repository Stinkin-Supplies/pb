"use client";

import { useMemo, useState, useEffect } from "react";
import NavBar from "@/components/NavBar";
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
      if (!user) {
        window.location.href = "/auth";
        return;
      }
      const { first, last } = splitName(ship.full_name);
      const payload = {
        user_id: user.id,
        first_name: first,
        last_name: last,
        address1: ship.address1,
        address2: ship.address2,
        city: ship.city,
        state: ship.state,
        zip: ship.zip,
        country: ship.country || "US",
      };
      const { error } = await supabase.from("user_addresses").insert(payload);
      if (error) {
        console.warn("Save address failed:", error.message);
        showShipmentToast("Could not save");
        return;
      }
      await refreshAddresses(user.id);
      showShipmentToast("Saved to account");
    } finally {
      setShipmentBusy(false);
    }
  };

  const handleUseAddress = async () => {
    if (shipmentBusy) return;
    setShipmentBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/auth";
        return;
      }

      let addressId = selectedAddressId;
      if (!addressId) {
        const { first, last } = splitName(ship.full_name);
        const { data: created, error: createErr } = await supabase
          .from("user_addresses")
          .insert({
            user_id: user.id,
            first_name: first,
            last_name: last,
            address1: ship.address1,
            address2: ship.address2,
            city: ship.city,
            state: ship.state,
            zip: ship.zip,
            country: ship.country || "US",
            is_default: true,
          })
          .select("id")
          .single();
        if (createErr || !created?.id) {
          console.warn("Use address failed:", createErr?.message);
          showShipmentToast("Could not apply");
          return;
        }
        addressId = created.id;
        setSelectedAddressId(addressId);
      }

      await supabase
        .from("user_addresses")
        .update({ is_default: false })
        .eq("user_id", user.id);
      const { error: defErr } = await supabase
        .from("user_addresses")
        .update({ is_default: true })
        .eq("id", addressId);
      if (defErr) {
        console.warn("Set default failed:", defErr.message);
        showShipmentToast("Could not apply");
        return;
      }
      await refreshAddresses(user.id);
      showShipmentToast("Applied to order");
    } finally {
      setShipmentBusy(false);
    }
  };

  // 🔹 Calculations
  const pointsValue = points * 0.01;
  const mapResult = applyMapPricing(
    cartItems.map(item => ({
      id: item.id,
      price: item.price,
      qty: item.qty,
      map_floor: item.map_floor,
    })),
    pointsValue
  );
  const subtotal = mapResult.subtotal;
  const pointsDiscount = mapResult.appliedDiscount;
  const shipping = subtotal >= 99 ? 0 : 5;
  const tax = subtotal * 0.07;
  const total = Math.max(mapResult.finalTotal + shipping + tax, 0);
  const toCents = (value) => Math.round(value * 100);

  const handleCheckout = async () => {
    if (checkoutLoading) return;
    setCheckoutLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const shippingAddress = {
        line1: ship.address1,
        line2: ship.address2 || null,
        city: ship.city,
        state: ship.state,
        postal_code: ship.zip,
        country: ship.country || "US",
      };
      const payload = {
        customer_email: user?.email ?? null,
        customer_name: ship.full_name || null,
        shipping_address: shippingAddress,
        billing_address: shippingAddress,
        subtotal: toCents(subtotal),
        shipping: toCents(shipping),
        tax: toCents(tax),
        discount: toCents(pointsDiscount),
        points_redeemed: points,
        points_redeemed_value: toCents(pointsValue),
        total: toCents(total),
        items: cartItems.map((item) => ({
          product_id: item.id,
          name: item.name,
          price: toCents(item.price),
          qty: item.qty,
        })),
      };

      const orderRes = await fetch("/api/checkout/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const orderJson = await orderRes.json();
      if (!orderRes.ok || !orderJson?.order_id) {
        console.error("Create order failed:", orderJson);
        setCheckoutLoading(false);
        return;
      }

      const sessionRes = await fetch("/api/checkout/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: orderJson.order_id,
          amount_cents: Math.round(total * 100),
        }),
      });
      const sessionJson = await sessionRes.json();
      if (!sessionRes.ok || !sessionJson?.url) {
        console.error("Create session failed:", sessionJson);
        setCheckoutLoading(false);
        return;
      }

      window.location.href = sessionJson.url;
    } catch (err) {
      console.error("Checkout error:", err);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const css = `
    *, *::before, *::after { box-sizing: border-box; }
    .checkout-wrap {
      min-height: 100vh;
      background: #0a0909;
      color: #f0ebe3;
      font-family: 'Barlow Condensed', sans-serif;
      position: relative;
      overflow: hidden;
    }
    .checkout-wrap::before {
      content: "";
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(232,98,26,0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(232,98,26,0.04) 1px, transparent 1px);
      background-size: 32px 32px;
      pointer-events: none;
    }
    .checkout-inner {
      max-width: 1240px;
      margin: 0 auto;
      padding: 28px 24px 60px;
      display: grid;
      grid-template-columns: 480px 1fr;
      gap: 24px;
      position: relative;
      z-index: 1;
    }
    .checkout-title {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 38px;
      letter-spacing: 0.06em;
      margin-bottom: 16px;
    }
    .card {
      background: #111010;
      border: 1px solid #2a2828;
      border-radius: 3px;
      padding: 22px;
      box-shadow: 0 14px 32px rgba(0,0,0,0.35);
    }
    .card.summary {
      border-color: rgba(232,98,26,0.35);
      box-shadow: 0 18px 40px rgba(0,0,0,0.45);
    }
    .card-title {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 22px;
      letter-spacing: 0.05em;
      margin-bottom: 12px;
    }
    .summary-title {
      font-size: 26px;
      letter-spacing: 0.08em;
    }
    .label {
      font-family: 'Share Tech Mono', monospace;
      font-size: 9px;
      letter-spacing: 0.14em;
      color: #8a8784;
      margin-bottom: 6px;
    }
    .input {
      width: 100%;
      height: 44px;
      background: #1a1919;
      border: 1px solid #2a2828;
      color: #f0ebe3;
      font-family: 'Barlow Condensed', sans-serif;
      font-size: 16px;
      padding: 0 12px;
      border-radius: 2px;
      outline: none;
    }
    .input:focus { border-color: #e8621a; }
    .select {
      width: 100%;
      height: 44px;
      background: #1a1919;
      border: 1px solid #2a2828;
      color: #f0ebe3;
      font-family: 'Barlow Condensed', sans-serif;
      font-size: 16px;
      padding: 0 10px;
      border-radius: 2px;
      outline: none;
      appearance: none;
    }
    .select:focus { border-color: #e8621a; }
    .muted {
      font-family: 'Share Tech Mono', monospace;
      font-size: 9px;
      letter-spacing: 0.12em;
      color: #8a8784;
      margin-top: 8px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      font-family: 'Share Tech Mono', monospace;
      font-size: 11px;
      letter-spacing: 0.1em;
      color: #f0ebe3;
    }
    .summary-row.muted { color: #8a8784; }
    .summary-divider {
      border: none;
      border-top: 1px solid #2a2828;
      margin: 12px 0;
    }
    .summary-total {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-family: 'Bebas Neue', sans-serif;
      font-size: 28px;
      letter-spacing: 0.05em;
      margin-top: 6px;
    }
    .order-total-val {
      font-size: 32px;
      color: #e8621a;
    }
    .checkout-btn {
      width: 100%;
      height: 50px;
      background: #e8621a;
      border: none;
      color: #0a0909;
      font-family: 'Bebas Neue', sans-serif;
      font-size: 20px;
      letter-spacing: 0.1em;
      border-radius: 2px;
      cursor: pointer;
      margin-top: 12px;
      box-shadow: 0 4px 24px rgba(232,98,26,0.3);
      transition: all 0.2s;
    }
    .checkout-btn:hover { background: #c94f0f; transform: translateY(-1px); }
    .checkout-btn.ghost {
      background: #1a1919;
      color: #f0ebe3;
      border: 1px solid #2a2828;
      box-shadow: none;
    }
    .empty {
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 24px;
      text-align: center;
      color: #8a8784;
    }
    @media (max-width: 980px) {
      .checkout-inner { grid-template-columns: 1fr; }
    }
  `;

  if (!cartItems.length) {
    return (
      <div className="checkout-wrap">
        <style>{css}</style>
        <NavBar activePage="shop" />
        <div className="empty">YOUR CART IS EMPTY</div>
      </div>
    );
  }

  return (
    <div className="checkout-wrap">
      <style>{css}</style>
      <NavBar activePage="shop" />
      <div className="checkout-inner">
        {/* LEFT — Order Summary */}
        <div>
          <div className="checkout-title">CHECKOUT</div>
          <div className="card summary">
            <div className="card-title summary-title">ORDER <span style={{color:"#e8621a"}}>SUMMARY</span></div>
            {cartItems.map((item) => (
              <div key={item.id} className="summary-row">
                <span>{item.name} × {item.qty}</span>
                <span>${(item.price * item.qty).toFixed(2)}</span>
              </div>
            ))}

            <hr className="summary-divider" />

            <div className="summary-row muted">
              <span>SUBTOTAL</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="summary-row muted">
              <span>SHIPPING</span>
              <span>${shipping.toFixed(2)}</span>
            </div>
            <div className="summary-row muted">
              <span>TAX</span>
              <span>${tax.toFixed(2)}</span>
            </div>
            <div className="summary-row" style={{color:"#c9a84c"}}>
              <span>POINTS DISCOUNT</span>
              <span>- ${pointsDiscount.toFixed(2)}</span>
            </div>

            <hr className="summary-divider" />

            <div className="summary-total">
              <span>ORDER TOTAL</span>
              <span className="order-total-val">${total.toFixed(2)}</span>
            </div>

          <button
            className="checkout-btn"
            onClick={handleCheckout}
          >
            {checkoutLoading ? "REDIRECTING..." : "CONTINUE →"}
          </button>
        </div>
        </div>

        {/* RIGHT — Details */}
        <div>
          <div className="card" style={{marginBottom:16}}>
            <div className="card-title">SHIPMENT <span style={{color:"#e8621a"}}>INFO</span></div>
            {addresses.length > 0 && (
              <>
                <div className="label">SAVED ADDRESSES</div>
                <select
                  className="select"
                  value={selectedAddressId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedAddressId(id);
                    const addr = addresses.find(a => String(a.id) === id);
                    if (addr) {
                      setShip(s => ({
                        ...s,
                        full_name: `${addr.first_name ?? ""} ${addr.last_name ?? ""}`.trim(),
                        address1: addr.address1 ?? "",
                        address2: addr.address2 ?? "",
                        city: addr.city ?? "",
                        state: addr.state ?? "",
                        zip: addr.zip ?? "",
                        country: addr.country ?? "US",
                      }));
                    }
                  }}
                >
                  {addresses.map(a => (
                    <option key={a.id} value={a.id}>
                      {(a.address1 ?? "Address")} — {(a.city ?? "")} {(a.state ?? "")}
                    </option>
                  ))}
                </select>
                <div style={{height:12}}/>
              </>
            )}
            <div style={{display:"flex", gap:8, marginBottom:12}}>
              <button
                className="checkout-btn"
                style={{height:42, fontSize:16, marginTop:0, flex:1}}
                onClick={handleUseAddress}
              >
                {shipmentBusy ? "WORKING..." : "USE THIS ADDRESS →"}
              </button>
              <button
                className="checkout-btn ghost"
                style={{height:42, fontSize:14, marginTop:0, flex:1}}
                onClick={handleSaveAddress}
              >
                {shipmentBusy ? "WORKING..." : "SAVE TO ACCOUNT"}
              </button>
            </div>
            <div className="label">FULL NAME</div>
            <input
              className="input"
              placeholder="John Doe"
              value={ship.full_name}
              onChange={(e) => setShip(s => ({ ...s, full_name: e.target.value }))}
            />
            <div style={{height:10}}/>
            <div className="label">ADDRESS</div>
            <AddressAutocomplete
              placeholder="123 Main St"
              onSelect={(parsed) => setShip(s => ({
                ...s,
                address1: parsed.address_line1,
                city: parsed.city,
                state: parsed.state,
                zip: parsed.zip,
                country: parsed.country || "US",
              }))}
              onChange={(val) => setShip(s => ({ ...s, address1: val }))}
            />
            <div style={{height:10}}/>
            <div className="label">CITY</div>
            <input
              className="input"
              placeholder="Palm Coast"
              value={ship.city}
              onChange={(e) => setShip(s => ({ ...s, city: e.target.value }))}
            />
            <div style={{height:10}}/>
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
              <div>
                <div className="label">STATE</div>
                <input
                  className="input"
                  placeholder="FL"
                  maxLength={2}
                  value={ship.state}
                  onChange={(e) => setShip(s => ({ ...s, state: e.target.value }))}
                />
              </div>
              <div>
                <div className="label">ZIP</div>
                <input
                  className="input"
                  placeholder="32137"
                  value={ship.zip}
                  onChange={(e) => setShip(s => ({ ...s, zip: e.target.value }))}
                />
              </div>
            </div>
            <div style={{height:10}}/>
            <div className="label">APT / SUITE (OPTIONAL)</div>
            <input
              className="input"
              placeholder="Apt 4B"
              value={ship.address2}
              onChange={(e) => setShip(s => ({ ...s, address2: e.target.value }))}
            />
          </div>

          <div className="card">
            <div className="card-title">REDEEM <span style={{color:"#e8621a"}}>POINTS</span></div>
            <div className="label">AVAILABLE POINTS</div>
            <div className="muted">{availablePoints.toLocaleString()} PTS</div>
            <div style={{height:8}}/>
            <div className="label">POINTS TO APPLY</div>
            <input
              type="number"
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
              className="input"
            />
            <div className="muted">
              {points} PTS = ${pointsValue.toFixed(2)}
            </div>
            {mapResult.appliedDiscount < pointsValue && (
              <div className="muted" style={{color:"#c9a84c"}}>
                DISCOUNT LIMITED DUE TO PRICING RULES
              </div>
            )}
          </div>
        </div>
      </div>
      {shipmentToast && (
        <div className="toast" style={{background:"#e8621a"}}>
          {shipmentToast.toUpperCase()}
        </div>
      )}
    </div>
  );
}
