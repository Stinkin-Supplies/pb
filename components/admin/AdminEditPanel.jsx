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

function parseCsvList(value) {
  return String(value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

// ── Main component ─────────────────────────────────────────────
export default function AdminEditPanel({ product }) {
  const searchParams = useSearchParams();
  const isAdmin = searchParams.get("admin") === "1";

  // Read only the URL param during render (server-safe).
  // sessionStorage is read after mount to avoid hydration mismatch.
  const tokenFromQuery = searchParams.get("token") ?? "";
  const [storedToken, setStoredToken] = useState("");
  const [adminTokenInput, setAdminTokenInput] = useState("");

  useEffect(() => {
    const saved = sessionStorage.getItem("stinkin_admin_token") ?? "";
    setStoredToken(saved);
  }, []);

  const activeToken = tokenFromQuery || storedToken || adminTokenInput.trim();

  const [open, setOpen]         = useState(false);
  const [saving, setSaving]     = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'ok' | 'err' | null
  const [saveMessage, setSaveMessage] = useState("");
  const [flagMode, setFlagMode] = useState(false);

  // Editable fields
  const [category,    setCategory]    = useState(product.displayCategory    ?? product.display_category ?? "");
  const [subcategory, setSubcategory] = useState(product.displaySubcategory ?? product.display_subcategory ?? "");
  const [fitsAll,     setFitsAll]     = useState(Boolean(product.fitsAllModels ?? product.isUniversal ?? product.is_universal ?? false));
  const [packQty,     setPackQty]     = useState(String(product.packQty ?? product.pack_qty ?? 1));
  const [vendorSku,   setVendorSku]   = useState(product.vendorSku ?? product.vendor_sku ?? "");
  const [brandPart,   setBrandPart]   = useState(product.brandPartNumber ?? product.brand_part_number ?? "");
  const [oemNumbers,  setOemNumbers]  = useState(Array.isArray(product.oemNumbers ?? product.oem_numbers)
    ? (product.oemNumbers ?? product.oem_numbers).join(", ")
    : "");
  const [canonicalId, setCanonicalId] = useState(String(product.canonicalProductId ?? product.canonical_product_id ?? ""));

  // Image management
  const initialImages = Array.isArray(product.imageUrls ?? product.image_urls)
    ? (product.imageUrls ?? product.image_urls).filter(Boolean)
    : (product.imageUrl ?? product.image_url) ? [(product.imageUrl ?? product.image_url)] : [];
  const [images, setImages] = useState(initialImages);
  const [newImageUrl, setNewImageUrl] = useState("");
  const [canonicalQuery, setCanonicalQuery] = useState(product.canonicalSku ?? product.canonical_sku ?? "");
  const [canonicalResults, setCanonicalResults] = useState([]);
  const [canonicalLoading, setCanonicalLoading] = useState(false);

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

  const hints = SUBCATEGORY_HINTS[category] ?? [];
  const dirty = category    !== (product.displayCategory    ?? "")
             || subcategory !== (product.displaySubcategory ?? "")
             || fitsAll     !== Boolean(product.fitsAllModels ?? product.isUniversal ?? product.is_universal ?? false)
             || packQty     !== String(product.packQty ?? product.pack_qty ?? 1)
             || vendorSku   !== (product.vendorSku ?? product.vendor_sku ?? "")
             || brandPart   !== (product.brandPartNumber ?? product.brand_part_number ?? "")
             || oemNumbers  !== (Array.isArray(product.oemNumbers ?? product.oem_numbers)
               ? (product.oemNumbers ?? product.oem_numbers).join(", ")
               : "")
             || canonicalId !== String(product.canonicalProductId ?? product.canonical_product_id ?? "")
             || JSON.stringify(images) !== JSON.stringify(initialImages);

  useEffect(() => {
    if (!open || flagMode) return;
    const query = canonicalQuery.trim();
    if (query.length < 2 || !activeToken) return;

    let active = true;
    const timer = setTimeout(async () => {
      setCanonicalLoading(true);
      try {
        const res = await fetch(
          `/api/admin/canonical-matches/search-products?token=${encodeURIComponent(activeToken)}&q=${encodeURIComponent(query)}&limit=8`
        );
        const data = await res.json();
        if (!active) return;
        setCanonicalResults(Array.isArray(data.results) ? data.results : []);
      } catch {
        if (active) setCanonicalResults([]);
      } finally {
        if (active) setCanonicalLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, flagMode, canonicalQuery, activeToken]);

  const canSearchCanonical = open && !flagMode && canonicalQuery.trim().length >= 2 && Boolean(activeToken);

  // Don't render at all for non-admin
  if (!isAdmin) return null;

  async function handleSave() {
    setSaving(true);
    setSaveStatus(null);
    setSaveMessage("");
    try {
      if (!activeToken) {
        setSaveStatus("err");
        setSaveMessage("Admin token required");
        return;
      }

      const body = flagMode
        ? {
            action: "flag",
            productId: product.id,
            flagType,
            flagNotes,
          }
        : {
            display_category:    category,
            display_subcategory: subcategory,
            fits_all_models:     fitsAll,
            is_universal:        fitsAll,
            pack_qty:            parseInt(packQty, 10) || 1,
            vendor_sku:          vendorSku.trim() || null,
            brand_part_number:   brandPart.trim() || null,
            oem_numbers:         parseCsvList(oemNumbers),
            canonical_product_id: canonicalId.trim() ? parseInt(canonicalId, 10) || null : null,
            image_url:   images[0] ?? null,
            image_urls:  images,
          };

          sessionStorage.setItem("stinkin_admin_token", activeToken);
          const res = await fetch(`/api/admin/products/${product.id}?token=${encodeURIComponent(activeToken)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

      if (!res.ok) {
        const text = await res.text();
        setSaveStatus("err");
        setSaveMessage(res.status === 401 ? "Unauthorized — verify the admin token" : text || "Save failed");
        return;
      }

      setSaveStatus("ok");
      setTimeout(() => { setSaveStatus(null); if (!flagMode) setOpen(false); }, 1800);
    } catch {
      setSaveStatus("err");
      setSaveMessage("Network error while saving");
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

        {!activeToken && (
          <div style={{
            padding: "12px 18px",
            background: C.goldBg,
            borderBottom: `1px solid ${C.borderLight}`,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}>
            <FieldLabel>Admin Token</FieldLabel>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={adminTokenInput}
                onChange={(e) => setAdminTokenInput(e.target.value)}
                placeholder="Paste ADMIN_SECRET…"
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  background: C.cream,
                  border: `1px solid ${C.border}`,
                  fontFamily: MONO,
                  fontSize: 13,
                  color: C.black,
                  letterSpacing: "0.04em",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <button
                type="button"
                onClick={() => {
                  if (adminTokenInput.trim()) {
                    sessionStorage.setItem("stinkin_admin_token", adminTokenInput.trim());
                  }
                }}
                style={{
                  padding: "10px 12px",
                  border: `1px solid ${C.gold}`,
                  background: C.gold,
                  color: C.black,
                  fontFamily: MONO,
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Store
              </button>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: C.inkLight, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Needed to save category, OEM, and canonical edits.
            </div>
          </div>
        )}

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

            {/* pack_qty */}
            <div>
              <FieldLabel>Pack Qty</FieldLabel>
              <input
                type="number"
                min="1"
                max="500"
                value={packQty}
                onChange={(e) => setPackQty(e.target.value)}
                style={{
                  width: 100,
                  padding: "10px 12px",
                  background: C.cream,
                  border: `1px solid ${packQty !== String(product.packQty ?? 1) ? C.gold : C.border}`,
                  fontFamily: MONO,
                  fontSize: 13,
                  color: C.black,
                  letterSpacing: "0.04em",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.inkLight, letterSpacing: "0.08em", marginTop: 4 }}>
                Units sold per listing (1 = individual)
              </div>
            </div>

            <div>
              <FieldLabel>Vendor SKU</FieldLabel>
              <input
                value={vendorSku}
                onChange={(e) => setVendorSku(e.target.value)}
                placeholder="Vendor SKU…"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  background: C.cream,
                  border: `1px solid ${vendorSku !== (product.vendorSku ?? product.vendor_sku ?? "") ? C.gold : C.border}`,
                  fontFamily: MONO,
                  fontSize: 13,
                  color: C.black,
                  letterSpacing: "0.04em",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <FieldLabel>Brand Part Number</FieldLabel>
              <input
                value={brandPart}
                onChange={(e) => setBrandPart(e.target.value)}
                placeholder="Brand part number…"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  background: C.cream,
                  border: `1px solid ${brandPart !== (product.brandPartNumber ?? product.brand_part_number ?? "") ? C.gold : C.border}`,
                  fontFamily: MONO,
                  fontSize: 13,
                  color: C.black,
                  letterSpacing: "0.04em",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <FieldLabel>OEM Numbers</FieldLabel>
              <textarea
                value={oemNumbers}
                onChange={(e) => setOemNumbers(e.target.value)}
                placeholder="Comma-separated OEM numbers…"
                style={{
                  width: "100%",
                  minHeight: 82,
                  padding: "10px 12px",
                  background: C.cream,
                  border: `1px solid ${oemNumbers !== (Array.isArray(product.oemNumbers ?? product.oem_numbers) ? (product.oemNumbers ?? product.oem_numbers).join(", ") : "") ? C.gold : C.border}`,
                  fontFamily: MONO,
                  fontSize: 13,
                  color: C.black,
                  letterSpacing: "0.04em",
                  outline: "none",
                  boxSizing: "border-box",
                  resize: "vertical",
                }}
              />
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.inkLight, letterSpacing: "0.1em", marginTop: 4, textTransform: "uppercase" }}>
                Stored as an array in the catalog.
              </div>
            </div>

            {/* ── Image manager ── */}
            <div>
              <FieldLabel>Images</FieldLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {images.length === 0 && (
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.inkLight, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    No images
                  </div>
                )}
                {images.map((url, i) => {
                  const src = url.includes("asset.lemansnet.com") || url.includes("lemans")
                    ? `/api/image-proxy?url=${encodeURIComponent(url)}`
                    : url;
                  return (
                    <div key={i} style={{
                      display: "flex", gap: 8, alignItems: "center",
                      padding: 8, background: C.cream, border: `1px solid ${C.borderLight}`,
                    }}>
                      <img
                        src={src}
                        alt=""
                        style={{ width: 52, height: 52, objectFit: "contain", background: "#fff", border: `1px solid ${C.borderLight}`, flexShrink: 0 }}
                        onError={e => { e.target.style.opacity = 0.2; }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {i === 0 && (
                          <div style={{ fontFamily: MONO, fontSize: 8, color: C.gold, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 2 }}>
                            Primary
                          </div>
                        )}
                        <div style={{
                          fontFamily: MONO, fontSize: 9, color: C.inkLight,
                          wordBreak: "break-all", lineHeight: 1.4,
                        }}>
                          {url.length > 60 ? url.slice(0, 57) + "…" : url}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                        {i > 0 && (
                          <button
                            type="button"
                            title="Move to primary"
                            onClick={() => setImages(prev => {
                              const next = [...prev];
                              next.splice(i, 1);
                              next.unshift(url);
                              return next;
                            })}
                            style={{ background: "none", border: `1px solid ${C.border}`, color: C.inkLight, cursor: "pointer", fontSize: 10, padding: "2px 5px" }}
                          >
                            ↑
                          </button>
                        )}
                        <button
                          type="button"
                          title="Remove image"
                          onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                          style={{ background: "none", border: `1px solid ${C.red}`, color: C.red, cursor: "pointer", fontSize: 11, padding: "2px 6px", fontWeight: 700 }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Add new image URL */}
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    value={newImageUrl}
                    onChange={e => setNewImageUrl(e.target.value)}
                    placeholder="Paste image URL to add…"
                    style={{
                      flex: 1, padding: "8px 10px", background: C.cream,
                      border: `1px solid ${C.border}`, fontFamily: MONO,
                      fontSize: 11, color: C.black, outline: "none", boxSizing: "border-box",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const u = newImageUrl.trim();
                      if (u && !images.includes(u)) setImages(prev => [...prev, u]);
                      setNewImageUrl("");
                    }}
                    style={{
                      padding: "8px 12px", background: C.creamMid,
                      border: `1px solid ${C.border}`, fontFamily: MONO,
                      fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
                      color: C.ink, cursor: "pointer",
                    }}
                  >
                    Add
                  </button>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.inkLight, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  First image is primary. ✕ removes from gallery. ↑ promotes to primary.
                </div>
              </div>
            </div>

            <div>
              <FieldLabel>Canonical Product</FieldLabel>
              <input
                value={canonicalQuery}
                onChange={(e) => {
                  const next = e.target.value;
                  setCanonicalQuery(next);
                  if (/^\d+$/.test(next.trim())) setCanonicalId(next.trim());
                }}
                placeholder="Search canonical matches by name, SKU, or brand part…"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  background: C.cream,
                  border: `1px solid ${canonicalId !== String(product.canonicalProductId ?? product.canonical_product_id ?? "") ? C.gold : C.border}`,
                  fontFamily: MONO,
                  fontSize: 13,
                  color: C.black,
                  letterSpacing: "0.04em",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.inkLight, letterSpacing: "0.1em", marginTop: 4, textTransform: "uppercase" }}>
                Current: {product.canonicalSku ?? product.canonical_sku ?? "—"}{canonicalId ? ` (#${canonicalId})` : ""}
              </div>

              {canSearchCanonical && canonicalLoading && (
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.inkLight, letterSpacing: "0.1em", marginTop: 8, textTransform: "uppercase" }}>
                  Searching canonical matches…
                </div>
              )}

              {canSearchCanonical && !canonicalLoading && canonicalResults.length > 0 && (
                <div style={{
                  marginTop: 8,
                  border: `1px solid ${C.borderLight}`,
                  background: C.cream,
                  maxHeight: 180,
                  overflowY: "auto",
                }}>
                  {canonicalResults.map((result) => {
                    const resultId = result.canonical_product_id ? String(result.canonical_product_id) : "";
                    return (
                      <button
                        key={result.id}
                        type="button"
                        onClick={() => {
                          setCanonicalId(resultId);
                          setCanonicalQuery(result.canonical_sku ?? result.name ?? "");
                          setCanonicalResults([]);
                        }}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "10px 12px",
                          border: "none",
                          borderBottom: `1px solid ${C.borderLight}`,
                          background: resultId && canonicalId === resultId ? C.goldBg : "transparent",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ fontFamily: MONO, fontSize: 11, color: C.black, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                          {result.name}
                        </div>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: C.inkLight, letterSpacing: "0.08em", marginTop: 2, textTransform: "uppercase" }}>
                          {result.source_vendor ?? "—"} · {result.vendor_sku ?? "—"} · {result.display_category ?? "—"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
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
              ✕ {saveMessage || "Save failed"}
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
              disabled={saving || (!flagMode && !dirty) || !activeToken}
              style={{
                flex: 1,
                height: 44,
                background: saving || !activeToken ? C.creamMid : (!flagMode && !dirty) ? C.creamMid : C.gold,
                border: "none",
                fontFamily: DISPLAY,
                fontSize: 18,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: saving || !activeToken || (!flagMode && !dirty) ? C.inkLight : C.black,
                cursor: saving || !activeToken || (!flagMode && !dirty) ? "not-allowed" : "pointer",
                transition: "background 0.15s",
              }}
            >
              {saving ? "Saving…" : !activeToken ? "Token Required" : flagMode ? "Submit Flag" : dirty ? "Save Changes" : "No Changes"}
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
