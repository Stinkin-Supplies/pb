"use client";
// components/admin/AdminEditPanel.jsx
// Inline product editor — appears on PDP when ?admin=1 is in URL.
// Pencil button floats top-right of the page. Slides open a panel
// over the right-side info column. Saves to PATCH /api/admin/products/[id].
// No auth framework needed — gate with NEXT_PUBLIC_ADMIN_SECRET env var.

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

// ── Design tokens (matches ProductDetailClient) ────────────────
const C = {
  gold:        "#C9A84C",
  goldText:    "#E8C96A",
  goldBorder:  "rgba(201,168,76,0.35)",
  goldBg:      "rgba(201,168,76,0.08)",
  cream:       "#F2EAD3",
  creamMid:    "#EDE0C0",
  surface:     "#FAF7EF",
  black:       "#141210",
  charcoal:    "#2A2520",
  ink:         "#574E38",
  inkLight:    "#8C7E62",
  border:      "#D6C99A",
  borderLight: "#EAE0C0",
  green:       "#3A6B3A",
  red:         "#8B2E2E",
  redBg:       "rgba(139,46,46,0.08)",
};

const MONO    = "'IBM Plex Mono','Courier New',monospace";
const DISPLAY = "'Bebas Neue','Barlow Condensed',sans-serif";
const BODY    = "'Barlow','Barlow Condensed',sans-serif";

// ── All 20 display categories ──────────────────────────────────
const DISPLAY_CATEGORIES = [
  "Engine",
  "Exhaust",
  "Transmission & Clutch",
  "Handlebar & Controls",
  "Suspension",
  "Brakes",
  "Foot Controls",
  "Lighting",
  "Electrical",
  "Seating",
  "Carburetion & Fuel",
  "Wheels & Tires",
  "Fenders & Body",
  "Frame & Hardware",
  "Instrumentation",
  "Luggage & Racks",
  "Security & Covers",
  "Tools & Chemicals",
  "Riding Gear & Apparel",
  "Accessories & Misc",
];

// Common subcategories per category — used for datalist suggestions
const SUBCATEGORY_HINTS = {
  "Engine":                  ["Gaskets & Seals", "Pistons & Rings", "Cams & Valvetrain", "Heads & Cylinders", "Oiling", "Primary Drive", "Covers & Hardware"],
  "Exhaust":                 ["Headers", "Mufflers", "Full Systems", "Heat Shields", "Gaskets"],
  "Transmission & Clutch":   ["Clutch Kits", "Clutch Plates", "Transmission Parts", "Shifter Parts", "Cables"],
  "Handlebar & Controls":    ["Handlebars", "Grips", "Levers", "Mirrors", "Cables", "Risers & Clamps"],
  "Suspension":              ["Fork Springs", "Fork Seals", "Rear Shocks", "Fork Tubes", "Triple Trees"],
  "Brakes":                  ["Rotors", "Pads", "Calipers", "Master Cylinders", "Lines & Hoses", "Hardware"],
  "Foot Controls":           ["Pegs & Boards", "Brake Pedals", "Shift Levers", "Heel-Toe Shifters"],
  "Lighting":                ["Headlights", "Turn Signals", "Tail Lights", "Auxiliary Lights", "Bulbs"],
  "Electrical":              ["Batteries", "Stators", "Regulators", "Ignition", "Wiring", "Switches"],
  "Seating":                 ["Solo Seats", "Two-Up Seats", "Pads & Pans", "Seat Hardware"],
  "Carburetion & Fuel":      ["Carburetors", "Jets & Needles", "Fuel Petcocks", "Air Cleaners", "Fuel Filters", "EFI Parts"],
  "Wheels & Tires":          ["Wheels", "Tires", "Tubes", "Bearings", "Axles", "Sprockets"],
  "Fenders & Body":          ["Front Fenders", "Rear Fenders", "Tanks", "Side Covers", "Fairing Parts"],
  "Frame & Hardware":        ["Frame Parts", "Fasteners", "Footpegs Mounts", "Engine Mounts", "Swingarm"],
  "Instrumentation":         ["Speedometers", "Tachometers", "Gauges", "Dash Hardware"],
  "Luggage & Racks":         ["Saddlebags", "Tour Packs", "Racks", "Bag Hardware"],
  "Security & Covers":       ["Covers", "Locks", "Alarms"],
  "Tools & Chemicals":       ["Shop Tools", "Lubricants", "Cleaners", "Thread Lockers"],
  "Riding Gear & Apparel":   ["Helmets", "Jackets", "Gloves", "Footwear", "Accessories"],
  "Accessories & Misc":      ["Decorative", "Trim", "Universal Hardware", "NOS / Vintage"],
};

// ── Flag types ─────────────────────────────────────────────────
const FLAG_TYPES = [
  { value: "wrong_category",    label: "Wrong category" },
  { value: "wrong_subcategory", label: "Wrong subcategory" },
  { value: "missing_fitment",   label: "Missing fitment" },
  { value: "wrong_fitment",     label: "Incorrect fitment" },
  { value: "bad_image",         label: "Bad / missing image" },
  { value: "duplicate",         label: "Possible duplicate" },
  { value: "other",             label: "Other issue" },
];

// ── Small reusable field label ─────────────────────────────────
function FieldLabel({ children }) {
  return (
    <div style={{
      fontFamily: MONO,
      fontSize: 9,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      color: C.inkLight,
      marginBottom: 5,
    }}>
      {children}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────
export default function AdminEditPanel({ product }) {
  const searchParams = useSearchParams();
  const isAdmin = searchParams.get("admin") === "1";

  const [open, setOpen]         = useState(false);
  const [saving, setSaving]     = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'ok' | 'err' | null
  const [flagMode, setFlagMode] = useState(false);

  // Editable fields
  const [category,    setCategory]    = useState(product.displayCategory    ?? "");
  const [subcategory, setSubcategory] = useState(product.displaySubcategory ?? "");
  const [fitsAll,     setFitsAll]     = useState(product.fitsAllModels      ?? false);

  // Flag fields
  const [flagType,  setFlagType]  = useState("wrong_category");
  const [flagNotes, setFlagNotes] = useState("");

  const panelRef = useRef(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Don't render at all for non-admin
  if (!isAdmin) return null;

  const hints = SUBCATEGORY_HINTS[category] ?? [];
  const dirty = category    !== (product.displayCategory    ?? "")
             || subcategory !== (product.displaySubcategory ?? "")
             || fitsAll     !== (product.fitsAllModels      ?? false);

  async function handleSave() {
    setSaving(true);
    setSaveStatus(null);
    try {
      const body = flagMode
        ? {
            action: "flag",
            productId: product.id,
            flagType,
            flagNotes,
          }
        : {
            action: "update",
            productId: product.id,
            display_category:    category,
            display_subcategory: subcategory,
            fits_all_models:     fitsAll,
          };

          const token = new URLSearchParams(window.location.search).get("token")
                         ?? sessionStorage.getItem("stinkin_admin_token")
                         ?? "";
          if (token) sessionStorage.setItem("stinkin_admin_token", token);
          const res = await fetch(`/api/admin/products/${product.id}?token=${encodeURIComponent(token)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

      if (!res.ok) throw new Error(await res.text());
      setSaveStatus("ok");
      setTimeout(() => { setSaveStatus(null); if (!flagMode) setOpen(false); }, 1800);
    } catch (err) {
      console.error(err);
      setSaveStatus("err");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* ── Floating trigger button ── */}
      <button
        onClick={() => setOpen(true)}
        title="Admin: Edit product"
        style={{
          position: "fixed",
          top: 80,
          right: open ? 372 : 16,
          zIndex: 900,
          width: 40,
          height: 40,
          background: open ? C.gold : C.charcoal,
          border: `1px solid ${open ? C.gold : C.border}`,
          borderRadius: "50%",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 12px rgba(0,0,0,0.35)",
          transition: "right 0.28s ease, background 0.15s",
        }}
      >
        {/* Pencil SVG */}
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
          stroke={open ? C.black : C.goldText} strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>

      {/* ── Slide-in panel ── */}
      <div
        ref={panelRef}
        style={{
          position: "fixed",
          top: 0,
          right: open ? 0 : -380,
          width: 360,
          height: "100vh",
          background: C.surface,
          borderLeft: `2px solid ${C.gold}`,
          zIndex: 850,
          overflowY: "auto",
          transition: "right 0.28s ease",
          boxShadow: open ? "-8px 0 32px rgba(0,0,0,0.3)" : "none",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          background: C.charcoal,
          padding: "16px 18px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontFamily: DISPLAY, fontSize: 20, color: C.goldText, letterSpacing: "0.1em" }}>
              ADMIN EDIT
            </div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: C.inkLight, letterSpacing: "0.14em", marginTop: 2, textTransform: "uppercase" }}>
              SKU: {product.sku}
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            style={{ background: "none", border: "none", cursor: "pointer", color: C.inkLight, fontSize: 20, lineHeight: 1, padding: 4 }}
          >
            ✕
          </button>
        </div>

        {/* Product name chip */}
        <div style={{
          padding: "12px 18px",
          background: C.cream,
          borderBottom: `1px solid ${C.borderLight}`,
          fontFamily: BODY,
          fontSize: 13,
          color: C.ink,
          lineHeight: 1.4,
          flexShrink: 0,
        }}>
          {product.name}
        </div>

        {/* Mode toggle */}
        <div style={{
          display: "flex",
          borderBottom: `1px solid ${C.border}`,
          flexShrink: 0,
        }}>
          {["Edit Fields", "Flag Issue"].map((label, i) => {
            const active = flagMode === (i === 1);
            return (
              <button
                key={label}
                onClick={() => setFlagMode(i === 1)}
                style={{
                  flex: 1,
                  padding: "12px 0",
                  background: active ? C.goldBg : "transparent",
                  border: "none",
                  borderBottom: `2px solid ${active ? C.gold : "transparent"}`,
                  fontFamily: MONO,
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: active ? C.black : C.inkLight,
                  cursor: "pointer",
                  marginBottom: -1,
                  transition: "all 0.15s",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* ── EDIT FIELDS mode ── */}
        {!flagMode && (
          <div style={{ padding: "22px 18px", flex: 1, display: "flex", flexDirection: "column", gap: 22 }}>

            {/* display_category */}
            <div>
              <FieldLabel>Display Category</FieldLabel>
              <select
                value={category}
                onChange={(e) => { setCategory(e.target.value); setSubcategory(""); }}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  background: C.cream,
                  border: `1px solid ${category !== (product.displayCategory ?? "") ? C.gold : C.border}`,
                  fontFamily: MONO,
                  fontSize: 13,
                  color: C.black,
                  letterSpacing: "0.04em",
                  appearance: "none",
                  cursor: "pointer",
                  outline: "none",
                }}
              >
                <option value="">— Uncategorized —</option>
                {DISPLAY_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              {/* Current value indicator */}
              {product.displayCategory && category !== product.displayCategory && (
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.inkLight, letterSpacing: "0.1em", marginTop: 4 }}>
                  Was: {product.displayCategory}
                </div>
              )}
            </div>

            {/* display_subcategory */}
            <div>
              <FieldLabel>Display Subcategory</FieldLabel>
              <input
                list="subcat-hints"
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value)}
                placeholder={hints[0] ? `e.g. ${hints[0]}` : "Subcategory…"}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  background: C.cream,
                  border: `1px solid ${subcategory !== (product.displaySubcategory ?? "") ? C.gold : C.border}`,
                  fontFamily: MONO,
                  fontSize: 13,
                  color: C.black,
                  letterSpacing: "0.04em",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <datalist id="subcat-hints">
                {hints.map((h) => <option key={h} value={h} />)}
              </datalist>
              {hints.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                  {hints.slice(0, 6).map((h) => (
                    <button
                      key={h}
                      onClick={() => setSubcategory(h)}
                      style={{
                        padding: "3px 8px",
                        background: subcategory === h ? C.gold : C.creamMid,
                        border: `1px solid ${subcategory === h ? C.gold : C.borderLight}`,
                        fontFamily: MONO,
                        fontSize: 9,
                        letterSpacing: "0.1em",
                        color: subcategory === h ? C.black : C.inkLight,
                        cursor: "pointer",
                        transition: "all 0.1s",
                      }}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              )}
              {product.displaySubcategory && subcategory !== product.displaySubcategory && (
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.inkLight, letterSpacing: "0.1em", marginTop: 4 }}>
                  Was: {product.displaySubcategory}
                </div>
              )}
            </div>

            {/* fits_all_models toggle */}
            <div>
              <FieldLabel>Fits All Models</FieldLabel>
              <button
                onClick={() => setFitsAll((f) => !f)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {/* Toggle track */}
                <div style={{
                  width: 44,
                  height: 24,
                  borderRadius: 12,
                  background: fitsAll ? C.gold : C.creamMid,
                  border: `1px solid ${fitsAll ? C.gold : C.border}`,
                  position: "relative",
                  transition: "background 0.15s",
                  flexShrink: 0,
                }}>
                  <div style={{
                    position: "absolute",
                    top: 3,
                    left: fitsAll ? 22 : 3,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: fitsAll ? C.black : C.inkLight,
                    transition: "left 0.15s",
                  }} />
                </div>
                <span style={{ fontFamily: MONO, fontSize: 11, color: fitsAll ? C.black : C.inkLight, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  {fitsAll ? "Universal fit" : "Model-specific"}
                </span>
              </button>
            </div>

            {/* Current raw category (read-only reference) */}
            <div style={{
              padding: "10px 12px",
              background: C.cream,
              border: `1px solid ${C.borderLight}`,
              borderLeft: `3px solid ${C.borderLight}`,
            }}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: C.inkLight, marginBottom: 4 }}>
                Raw vendor category
              </div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.ink, letterSpacing: "0.04em" }}>
                {product.category ?? "—"}
                {product.subcategory ? ` · ${product.subcategory}` : ""}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", color: C.inkLight, marginTop: 3, textTransform: "uppercase" }}>
                Vendor: {product.sourceVendor ?? "—"}
              </div>
            </div>
          </div>
        )}

        {/* ── FLAG ISSUE mode ── */}
        {flagMode && (
          <div style={{ padding: "22px 18px", flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <FieldLabel>Issue Type</FieldLabel>
              <select
                value={flagType}
                onChange={(e) => setFlagType(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  background: C.cream,
                  border: `1px solid ${C.border}`,
                  fontFamily: MONO,
                  fontSize: 13,
                  color: C.black,
                  letterSpacing: "0.04em",
                  appearance: "none",
                  cursor: "pointer",
                  outline: "none",
                }}
              >
                {FLAG_TYPES.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Notes (optional)</FieldLabel>
              <textarea
                value={flagNotes}
                onChange={(e) => setFlagNotes(e.target.value)}
                rows={4}
                placeholder="What's wrong? What should it be?"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  background: C.cream,
                  border: `1px solid ${C.border}`,
                  fontFamily: MONO,
                  fontSize: 12,
                  color: C.black,
                  letterSpacing: "0.03em",
                  lineHeight: 1.6,
                  resize: "vertical",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{
              padding: "10px 12px",
              background: C.redBg,
              border: `1px solid rgba(139,46,46,0.2)`,
              borderLeft: `3px solid ${C.red}`,
            }}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: C.red, marginBottom: 3 }}>
                This just flags it
              </div>
              <div style={{ fontFamily: BODY, fontSize: 12, color: C.ink, lineHeight: 1.5 }}>
                Flags are saved to <code style={{ fontFamily: MONO, fontSize: 11 }}>catalog_review_flags</code> for batch review — nothing changes on the live product.
              </div>
            </div>
          </div>
        )}

        {/* ── Footer / save bar ── */}
        <div style={{
          padding: "14px 18px",
          borderTop: `1px solid ${C.border}`,
          background: C.cream,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}>
          {saveStatus === "ok" && (
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.green, textAlign: "center" }}>
              ✓ {flagMode ? "Flag saved" : "Saved — Typesense updated"}
            </div>
          )}
          {saveStatus === "err" && (
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.red, textAlign: "center" }}>
              ✕ Save failed — check console
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setOpen(false)}
              style={{
                flex: "0 0 80px",
                height: 44,
                background: "none",
                border: `1px solid ${C.border}`,
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: C.inkLight,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || (!flagMode && !dirty)}
              style={{
                flex: 1,
                height: 44,
                background: saving ? C.creamMid : (!flagMode && !dirty) ? C.creamMid : C.gold,
                border: "none",
                fontFamily: DISPLAY,
                fontSize: 18,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: saving || (!flagMode && !dirty) ? C.inkLight : C.black,
                cursor: saving || (!flagMode && !dirty) ? "not-allowed" : "pointer",
                transition: "background 0.15s",
              }}
            >
              {saving ? "Saving…" : flagMode ? "Submit Flag" : dirty ? "Save Changes" : "No Changes"}
            </button>
          </div>
          {!flagMode && dirty && (
            <button
              onClick={() => { setCategory(product.displayCategory ?? ""); setSubcategory(product.displaySubcategory ?? ""); setFitsAll(product.fitsAllModels ?? false); }}
              style={{ background: "none", border: "none", fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: C.inkLight, cursor: "pointer", textAlign: "right", padding: 0 }}
            >
              ↺ Reset to original
            </button>
          )}
        </div>
      </div>

      {/* Backdrop — click outside to close */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 840, background: "rgba(20,18,16,0.3)" }}
        />
      )}
    </>
  );
}
