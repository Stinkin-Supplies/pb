"use client";
// ============================================================
// app/garage/GarageHub.jsx
// ============================================================
// Unified My Garage — 5 tabs in one place:
//   PROFILE · BIKES · POINTS · WISHLIST · ORDERS
// ============================================================

import { useState, useEffect } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import AddressAutocomplete from "@/components/AddressAutocomplete";

const supabase = createBrowserSupabaseClient();

// ── HD model → browse family mapping ─────────────────────────
const HD_MODEL_TO_FAMILY = {
  "Road King":              "Touring",
  "Road King Special":      "Touring",
  "Street Glide":           "Touring",
  "Street Glide Special":   "Touring",
  "Road Glide":             "Touring",
  "Road Glide Special":     "Touring",
  "Fat Boy":                "Softail",
  "Fat Boy 114":            "Softail",
  "Softail Slim":           "Softail",
  "Low Rider":              "Dyna",
  "Low Rider S":            "Softail",
  "Fat Bob":                "Dyna",
  "Heritage Classic":       "Softail",
  "Breakout":               "Softail",
  "Sport Glide":            "Softail",
  "Iron 883":               "Sportster",
  "Iron 1200":              "Sportster",
  "Forty-Eight":            "Sportster",
  "Sportster S":            "Sportster",
  "Nightster":              "Sportster",
  "Nightster Special":      "Sportster",
  "Pan America 1250":       "Revolution Max",
};

function buildShopUrl(vehicle) {
  if (vehicle.make === "Harley-Davidson") {
    const p = new URLSearchParams();
    if (vehicle.modelCode) {
      // Real model_code → precise fitment filtering (lib/db/browse.ts).
      p.set("model_code", vehicle.modelCode);
    } else {
      // Older saved vehicles predating model_code capture — fall back to
      // the coarser family-only filter.
      const family = HD_MODEL_TO_FAMILY[vehicle.model];
      if (family) p.set("family", family);
    }
    if (vehicle.year) p.set("year", String(vehicle.year));
    if ([...p.keys()].length > 0) return `/browse?${p.toString()}`;
  }
  return "/browse";
}

// ── YMM Data ─────────────────────────────────────────────────
// Harley-Davidson only — this is an H-D aftermarket parts catalog, and only
// H-D fitment data exists to filter against.
const YEARS = Array.from({ length: 35 }, (_, i) => 2025 - i);
const HD_MAKE = "Harley-Davidson";

const POINTS_TO_DOLLAR = 0.01;
const FREE_SHIPPING    = 99;
const TIER_THRESHOLDS  = [
  { name:"RIDER",    min:0,    color:"#8a8784" },
  { name:"THROTTLE", min:500,  color:"#e8621a" },
  { name:"IRON",     min:2000, color:"#c9a84c" },
  { name:"LEGEND",   min:5000, color:"#f0ebe3" },
];

const STATUS_COLORS = {
  pending:    "#c9a84c",
  processing: "#e8621a",
  shipped:    "#3b82f6",
  delivered:  "#22c55e",
  cancelled:  "#8a8784",
};

const css = `
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  ::-webkit-scrollbar { width:4px; }
  ::-webkit-scrollbar-thumb { background:rgba(184,146,42,0.4); border-radius:2px; }
  @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes spin { to{transform:rotate(360deg)} }

  .gh-wrap { background:#faf7f2; min-height:100vh; color:#2a2018; font-family:var(--font-stencil),sans-serif; }

  /* HERO HEADER */
  .gh-header { background:#f5f0e8;border-bottom:1px solid rgba(184,146,42,0.2);padding:24px 24px 0;position:relative;overflow:hidden; }
  .gh-header::before { content:'';position:absolute;inset:0;background-image:linear-gradient(rgba(184,146,42,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(184,146,42,0.04) 1px,transparent 1px);background-size:32px 32px; }
  .gh-header-inner { max-width:1100px;margin:0 auto;position:relative;z-index:1; }
  .gh-header-top { display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px; }
  .gh-eyebrow { font-family:var(--font-stencil),monospace;font-size:9px;color:#b8922a;letter-spacing:0.25em;margin-bottom:6px; }
  .gh-name { font-family:var(--font-caesar),sans-serif;font-size:44px;letter-spacing:0.04em;line-height:1;color:#2a2018; }
  .gh-name span { color:#b8922a; }
  .gh-email { font-size:13px;color:#888;margin-top:4px; }
  .gh-stats { display:flex;gap:24px;flex-wrap:wrap; }
  .gh-stat { text-align:right; }
  .gh-stat-val { font-family:var(--font-caesar),sans-serif;font-size:28px;color:#b8922a;letter-spacing:0.04em;line-height:1; }
  .gh-stat-label { font-family:var(--font-stencil),monospace;font-size:8px;color:#888;letter-spacing:0.12em; }

  /* TABS */
  .gh-tabs { display:flex;gap:0;overflow-x:auto;border-bottom:1px solid rgba(184,146,42,0.2); }
  .gh-tabs::-webkit-scrollbar { height:2px; }
  .gh-tab { font-family:var(--font-stencil),monospace;font-size:10px;letter-spacing:0.15em;padding:14px 22px;cursor:pointer;color:#aaa;border-bottom:2px solid transparent;transition:all 0.2s;white-space:nowrap;background:none;border-left:none;border-right:none;border-top:none; }
  .gh-tab.active { color:#b8922a;border-bottom-color:#b8922a; }
  .gh-tab:hover:not(.active) { color:#2a2018; }

  /* BODY */
  .gh-body { max-width:1100px;margin:0 auto;padding:24px;animation:fadeUp 0.25s ease; }

  /* CARDS */
  .gh-card { background:#ffffff;border:1px solid rgba(184,146,42,0.2);border-radius:3px;margin-bottom:14px;overflow:hidden; }
  .gh-card-head { padding:14px 18px;border-bottom:1px solid rgba(184,146,42,0.15);display:flex;align-items:center;justify-content:space-between; }
  .gh-card-title { font-family:var(--font-caesar),sans-serif;font-size:19px;letter-spacing:0.05em;color:#2a2018; }
  .gh-card-title span { color:#b8922a; }
  .gh-card-body { padding:18px; }

  /* FORM ELEMENTS */
  .gh-field { display:flex;flex-direction:column;gap:5px; }
  .gh-label { font-family:var(--font-stencil),monospace;font-size:8px;color:#888;letter-spacing:0.15em; }
  .gh-input { background:#faf7f2;border:1px solid rgba(184,146,42,0.3);color:#2a2018;font-family:var(--font-stencil),sans-serif;font-size:15px;font-weight:500;padding:9px 12px;border-radius:2px;outline:none;width:100%;transition:border-color 0.2s; }
  .gh-input:focus { border-color:#b8922a; }
  .gh-input:disabled { opacity:0.5;cursor:not-allowed; }
  .gh-input::placeholder { color:#ccc; }
  .gh-select { background:#faf7f2;border:1px solid rgba(184,146,42,0.3);color:#2a2018;font-family:var(--font-stencil),sans-serif;font-size:15px;font-weight:500;padding:9px 12px;border-radius:2px;outline:none;appearance:none;cursor:pointer;width:100%;transition:border-color 0.2s; }
  .gh-select:focus { border-color:#b8922a; }
  .gh-select:disabled { opacity:0.4;cursor:not-allowed; }
  .gh-grid-2 { display:grid;grid-template-columns:1fr 1fr;gap:12px; }
  .gh-grid-3 { display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px; }
  .gh-grid-4 { display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px; }
  .gh-full { grid-column:1/-1; }

  /* BUTTONS */
  .btn-orange { background:#b8922a;border:none;color:#ffffff;font-family:var(--font-caesar),sans-serif;font-size:16px;letter-spacing:0.1em;padding:9px 20px;border-radius:2px;cursor:pointer;transition:background 0.2s;white-space:nowrap; }
  .btn-orange:hover { background:#9a7820; }
  .btn-orange:disabled { opacity:0.4;cursor:not-allowed; }
  .btn-ghost { background:transparent;border:1px solid rgba(184,146,42,0.3);color:#888;font-family:var(--font-stencil),monospace;font-size:9px;letter-spacing:0.12em;padding:7px 14px;border-radius:2px;cursor:pointer;transition:all 0.2s;white-space:nowrap; }
  .btn-ghost:hover { border-color:#b8922a;color:#b8922a; }
  .btn-danger { background:transparent;border:1px solid rgba(185,28,28,0.25);color:#ef4444;font-family:var(--font-stencil),monospace;font-size:9px;letter-spacing:0.12em;padding:7px 14px;border-radius:2px;cursor:pointer;transition:all 0.2s;white-space:nowrap; }
  .btn-danger:hover { background:rgba(185,28,28,0.06);border-color:#b91c1c; }

  /* TOGGLE */
  .gh-toggle { width:32px;height:18px;border-radius:9px;position:relative;cursor:pointer;transition:background 0.2s;flex-shrink:0; }
  .gh-toggle.on { background:#b8922a; }
  .gh-toggle.off { background:rgba(184,146,42,0.2); }
  .gh-toggle-thumb { position:absolute;top:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.15); }
  .gh-toggle.on .gh-toggle-thumb { left:16px; }
  .gh-toggle.off .gh-toggle-thumb { left:2px; }

  /* BIKE CARDS */
  .bikes-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px; }
  .bike-card { background:#fff;border:1px solid rgba(184,146,42,0.2);border-left:3px solid rgba(184,146,42,0.2);border-radius:0 3px 3px 0;padding:16px;transition:all 0.2s; }
  .bike-card.primary { border-left-color:#b8922a;background:#fffdf5; }
  .bike-card:hover { border-color:rgba(184,146,42,0.4);border-left-color:#b8922a; }
  .bike-year { font-family:var(--font-caesar),sans-serif;font-size:34px;letter-spacing:0.04em;line-height:1; }
  .bike-card.primary .bike-year { color:#b8922a; }
  .bike-card:not(.primary) .bike-year { color:#ccc; }
  .bike-name { font-family:var(--font-caesar),sans-serif;font-size:17px;letter-spacing:0.04em;color:#2a2018;line-height:1.2;margin-bottom:3px; }
  .bike-meta { font-family:var(--font-stencil),monospace;font-size:8px;color:#888;letter-spacing:0.1em;margin-bottom:10px; }
  .bike-actions { display:flex;gap:7px;flex-wrap:wrap; }

  /* ADDRESS CARDS */
  .addr-card { background:#faf7f2;border:1px solid rgba(184,146,42,0.2);border-radius:2px;padding:14px 16px;margin-bottom:10px; }
  .addr-card.default { border-color:rgba(184,146,42,0.5); }
  .addr-default-badge { font-family:var(--font-stencil),monospace;font-size:7px;color:#b8922a;letter-spacing:0.15em;border:1px solid rgba(184,146,42,0.3);padding:1px 6px;border-radius:1px;display:inline-block;margin-bottom:6px; }
  .addr-name { font-size:14px;font-weight:700;color:#2a2018;margin-bottom:3px; }
  .addr-text { font-size:13px;color:#888;line-height:1.5; }
  .addr-actions { display:flex;gap:8px;margin-top:10px; }

  /* POINTS */
  .points-grid { display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px; }
  .points-stat { background:#faf7f2;border:1px solid rgba(184,146,42,0.2);border-radius:2px;padding:14px; }
  .points-stat.gold { border-color:rgba(184,146,42,0.4);background:#fffdf5; }
  .points-val { font-family:var(--font-caesar),sans-serif;font-size:32px;letter-spacing:0.04em;line-height:1;margin-bottom:3px;color:#2a2018; }
  .points-stat.gold .points-val { color:#b8922a; }
  .points-lbl { font-family:var(--font-stencil),monospace;font-size:8px;color:#888;letter-spacing:0.12em; }
  .tier-track { height:5px;background:rgba(184,146,42,0.15);border-radius:3px;overflow:hidden;margin:10px 0 5px; }
  .tier-fill { height:100%;background:linear-gradient(90deg,#b8922a,#d4aa42);border-radius:3px;transition:width 0.6s ease; }
  .tier-labels { display:flex;justify-content:space-between;font-family:var(--font-stencil),monospace;font-size:8px;color:#888;letter-spacing:0.08em; }
  .how-grid { display:grid;grid-template-columns:1fr 1fr;gap:8px; }
  .how-card { background:#faf7f2;border:1px solid rgba(184,146,42,0.2);border-radius:2px;padding:12px 14px; }
  .how-rate { font-family:var(--font-caesar),sans-serif;font-size:24px;color:#b8922a;letter-spacing:0.04em;line-height:1;margin-bottom:3px; }
  .how-desc { font-size:13px;font-weight:500;color:#888;line-height:1.4; }
  .ledger-table { width:100%;border-collapse:collapse; }
  .ledger-table th { font-family:var(--font-stencil),monospace;font-size:8px;color:#888;letter-spacing:0.12em;padding:8px 10px;text-align:left;border-bottom:1px solid rgba(184,146,42,0.2); }
  .ledger-table td { padding:10px;border-bottom:1px solid rgba(184,146,42,0.1);font-size:13px;font-weight:500; }
  .ledger-table tr:last-child td { border-bottom:none; }
  .pts-earn { color:#22c55e; } .pts-redeem { color:#b8922a; } .pts-expire { color:#888; }

  /* WISHLIST */
  .wl-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px; }
  .wl-card { background:#fff;border:1px solid rgba(184,146,42,0.2);border-radius:3px;overflow:hidden;transition:all 0.2s; }
  .wl-card:hover { border-color:rgba(184,146,42,0.5);transform:translateY(-2px); }
  .wl-img { width:100%;aspect-ratio:4/3;background:#faf7f2;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;cursor:pointer; }
  .wl-img::before { content:'';position:absolute;inset:0;background-image:linear-gradient(rgba(184,146,42,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(184,146,42,0.04) 1px,transparent 1px);background-size:16px 16px; }
  .wl-body { padding:12px; }
  .wl-brand { font-family:var(--font-stencil),monospace;font-size:9px;color:#b8922a;letter-spacing:0.12em;margin-bottom:3px; }
  .wl-name { font-size:13px;font-weight:700;color:#2a2018;line-height:1.3;margin-bottom:7px;cursor:pointer; }
  .wl-price { font-family:var(--font-caesar),sans-serif;font-size:20px;color:#2a2018;letter-spacing:0.04em;margin-bottom:8px; }
  .wl-stock { font-family:var(--font-stencil),monospace;font-size:8px;letter-spacing:0.1em;margin-bottom:8px; }
  .wl-in { color:#22c55e; } .wl-out { color:#888; }
  .wl-actions { display:flex;gap:7px; }
  .wl-notify { display:flex;align-items:center;gap:7px;margin-top:8px;padding-top:8px;border-top:1px solid rgba(184,146,42,0.1); }
  .wl-notify-lbl { font-family:var(--font-stencil),monospace;font-size:8px;color:#888;letter-spacing:0.08em;flex:1; }

  /* ORDERS */
  .order-row { border:1px solid rgba(184,146,42,0.2);border-radius:2px;margin-bottom:8px;overflow:hidden; }
  .order-row-head { display:flex;align-items:center;gap:14px;padding:13px 16px;background:#faf7f2;flex-wrap:wrap; }
  .order-id { font-family:var(--font-stencil),monospace;font-size:10px;color:#888;letter-spacing:0.1em; }
  .order-date { font-family:var(--font-stencil),monospace;font-size:9px;color:#888;letter-spacing:0.08em; }
  .order-status { font-family:var(--font-stencil),monospace;font-size:8px;letter-spacing:0.12em;padding:2px 8px;border-radius:1px; }
  .order-total { font-family:var(--font-caesar),sans-serif;font-size:18px;color:#2a2018;letter-spacing:0.04em;margin-left:auto; }
  .order-items { padding:10px 16px;background:#fff;border-top:1px solid rgba(184,146,42,0.1); }
  .order-item { display:flex;justify-content:space-between;font-size:13px;font-weight:500;color:#888;padding:4px 0; }
  .order-item span:last-child { color:#2a2018; }

  /* MODALS */
  .gh-modal-overlay { position:fixed;inset:0;z-index:300;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto; }
  .gh-modal { background:#fff;border:1px solid rgba(184,146,42,0.25);border-radius:4px;padding:24px;width:100%;max-width:500px;margin:auto;position:relative;box-shadow:0 20px 60px rgba(0,0,0,0.15); }
  .gh-modal-title { font-family:var(--font-caesar),sans-serif;font-size:22px;letter-spacing:0.05em;margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;color:#2a2018; }
  .gh-modal-title span { color:#b8922a; }
  .gh-modal-close { background:none;border:none;color:#aaa;font-size:18px;cursor:pointer;transition:color 0.15s; }
  .gh-modal-close:hover { color:#2a2018; }

  /* EMPTY STATE */
  .gh-empty { padding:48px;text-align:center; }
  .gh-empty-title { font-family:var(--font-caesar),sans-serif;font-size:26px;letter-spacing:0.05em;color:#ccc;margin-bottom:6px; }
  .gh-empty-sub { font-family:var(--font-stencil),monospace;font-size:9px;color:#aaa;letter-spacing:0.12em;margin-bottom:18px; }

  /* TOAST */
  .gh-toast { position:fixed;bottom:24px;right:24px;z-index:400;background:#22c55e;color:#fff;font-family:var(--font-caesar),sans-serif;font-size:15px;letter-spacing:0.1em;padding:11px 22px;border-radius:2px;box-shadow:0 8px 32px rgba(0,0,0,0.15);animation:fadeUp 0.25s ease; }

  @media (max-width:700px) {
    .points-grid { grid-template-columns:1fr 1fr; }
    .gh-grid-4 { grid-template-columns:1fr 1fr; }
    .gh-grid-3 { grid-template-columns:1fr; }
    .how-grid { grid-template-columns:1fr; }
  }
`;

// ── Helpers ───────────────────────────────────────────────────
function getTier(pts) {
  return [...TIER_THRESHOLDS].reverse().find(t => pts >= t.min) ?? TIER_THRESHOLDS[0];
}
function getLedgerClass(type = "") {
  if (type.includes("earn") || type.includes("award") || type.includes("birthday")) return "pts-earn";
  if (type.includes("redeem")) return "pts-redeem";
  return "pts-expire";
}

// ── MAIN COMPONENT ────────────────────────────────────────────
export default function GarageHub({ user, initialAddresses, initialVehicles, ledger, wishlist, orders, initialTab }) {
  const [tab, setTab] = useState(initialTab ?? "PROFILE");

  // Profile state
  const [editing,   setEditing]   = useState(false);
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName,  setLastName]  = useState(user.lastName);
  const [phone,     setPhone]     = useState(user.phone);
  const [savingProfile, setSavingProfile] = useState(false);

  // Address state
  const [addresses,    setAddresses]    = useState(initialAddresses);
  const [showAddrForm, setShowAddrForm] = useState(false);
  const [newAddr,      setNewAddr]      = useState({ first_name:"", last_name:"", address1:"", address2:"", city:"", state:"", zip:"", country:"US", is_default:false });
  const parseCommaAddress = (value) => {
    if (!value) return { city:"", state:"", zip:"" };
    const segments = value.split(",").map(s => s.trim()).filter(Boolean);
    const fallback = { city:"", state:"", zip:"" };
    if (segments.length >= 2) {
      fallback.city = segments[1];
    }
    const stateZipSegment = segments.length >= 3 ? segments[2] : segments.length === 2 ? segments[1] : "";
    if (stateZipSegment) {
      const parts = stateZipSegment.split(/\s+/).filter(Boolean);
      if (parts.length >= 1) fallback.state = parts[0].toUpperCase();
      if (parts.length >= 2) fallback.zip = parts.slice(1).join(" ");
    }
    return fallback;
  };
  const handleStreetInputChange = (value) => {
    const parts = value.split(",").map(s => s.trim()).filter(Boolean);
    const addr1 = parts[0] ?? "";
    const city = parts[1] ?? "";
    let state = "";
    let zip = "";
    if (parts.length >= 3) {
      const penultimate = parts[parts.length - 2].replace(/USA$/i, "").trim();
      const [s, ...rest] = penultimate.split(/\s+/).filter(Boolean);
      state = s ?? "";
      zip = rest.join(" ") ?? "";
    }
    setNewAddr(a => ({
      ...a,
      address1: addr1,
      city:     city || a.city,
      state:    state || a.state,
      zip:      zip || a.zip,
    }));
  };
  const [savingAddr,   setSavingAddr]   = useState(false);

  // Bikes state — Harley-Davidson only (see HD_MAKE above).
  const [vehicles,  setVehicles]  = useState(initialVehicles);
  const [showAddBike, setShowAddBike] = useState(false);
  const [bikeYear,  setBikeYear]  = useState("");
  const [bikeModel, setBikeModel] = useState("");
  const [bikeModelCode, setBikeModelCode] = useState(null);
  const [bikeNick,  setBikeNick]  = useState("");
  const [savingBike, setSavingBike] = useState(false);

  // Fetch the real models that existed in the chosen year so we always
  // capture an exact model_code (needed for fitment filtering) instead of a
  // free-text marketing name.
  const [hdModelsRaw, setHdModelsRaw] = useState([]);
  const [loadingHdModels, setLoadingHdModels] = useState(false);
  useEffect(() => {
    if (!bikeYear) return; // stale hdModelsRaw is simply unused while no year is picked
    let cancelled = false;
    (async () => {
      setLoadingHdModels(true);
      try {
        const res = await fetch(`/api/hd-models?year=${bikeYear}`);
        const data = await res.json();
        if (!cancelled) setHdModelsRaw(data.models ?? []);
      } catch {
        if (!cancelled) setHdModelsRaw([]);
      } finally {
        if (!cancelled) setLoadingHdModels(false);
      }
    })();
    return () => { cancelled = true; };
  }, [bikeYear]);
  const hdModels = bikeYear ? hdModelsRaw : [];

  // hdModels arrives pre-sorted by family then model_code (see /api/hd-models) —
  // group into consecutive runs so the picker can render one <optgroup> per family.
  const hdModelGroups = hdModels.reduce((groups, m) => {
    const last = groups[groups.length - 1];
    if (last && last.family === m.family) last.models.push(m);
    else groups.push({ family: m.family, models: [m] });
    return groups;
  }, []);

  const titleCase = (s) => s.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());

  // Wishlist state
  const [wishlistItems, setWishlistItems] = useState(wishlist);
  const [cartCount, setCartCount] = useState(0);

  const [toast, setToast] = useState(null);
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  // ── Profile handlers ────────────────────────────────────────
  const handleSaveProfile = async () => {
    setSavingProfile(true);
    const { error } = await supabase.from("user_profiles")
      .update({ first_name: firstName, last_name: lastName, phone })
      .eq("id", user.id);
    setSavingProfile(false);
    if (!error) { setEditing(false); showToast("Profile updated"); }
    else showToast(error.message);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  // ── Address handlers ────────────────────────────────────────
  const handleSaveAddress = async () => {
    setSavingAddr(true);
    const { data, error } = await supabase.from("user_addresses")
      .insert({ ...newAddr, user_id: user.id })
      .select().single();
    setSavingAddr(false);
    if (error) { showToast(error.message); return; }
    setAddresses(prev => newAddr.is_default ? [data, ...prev.map(a => ({...a, is_default:false}))] : [...prev, data]);
    setShowAddrForm(false);
    setNewAddr({ first_name:"", last_name:"", address1:"", address2:"", city:"", state:"", zip:"", country:"US", is_default:false });
    showToast("Address saved");
  };

  const handleRemoveAddress = async (id) => {
    await supabase.from("user_addresses").delete().eq("id", id);
    setAddresses(prev => prev.filter(a => a.id !== id));
    showToast("Address removed");
  };

  const handleSetDefaultAddress = async (id) => {
    await supabase.from("user_addresses").update({ is_default: false }).eq("user_id", user.id);
    await supabase.from("user_addresses").update({ is_default: true }).eq("id", id);
    setAddresses(prev => prev.map(a => ({ ...a, is_default: a.id === id })));
    showToast("Default address updated");
  };

  // ── Bike handlers ───────────────────────────────────────────
  const handleAddBike = async () => {
    if (!bikeYear || !bikeModel) return;
    setSavingBike(true);
    const isPrimary = vehicles.length === 0;

    let vehicleRow = null;
    const { data: existing } = await supabase.from("vehicles")
      .select("id, year, make, model, model_code, submodel, type")
      .eq("year", parseInt(bikeYear)).eq("make", HD_MAKE).eq("model", bikeModel)
      .limit(1).maybeSingle();

    if (existing) {
      vehicleRow = existing;
      // Backfill model_code on older rows saved before this was captured.
      if (!existing.model_code && bikeModelCode) {
        await supabase.from("vehicles").update({ model_code: bikeModelCode }).eq("id", existing.id);
        vehicleRow = { ...existing, model_code: bikeModelCode };
      }
    } else {
      const { data: created, error: cErr } = await supabase.from("vehicles")
        .insert({ year: parseInt(bikeYear), make: HD_MAKE, model: bikeModel, model_code: bikeModelCode, type: "motorcycle" })
        .select("id, year, make, model, model_code, submodel, type").single();
      if (cErr) { setSavingBike(false); showToast(cErr.message); return; }
      vehicleRow = created;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const { data: garageRow, error } = await supabase.from("user_garage")
      .insert({ user_id: session.user.id, vehicle_id: vehicleRow.id, nickname: bikeNick || null, is_primary: isPrimary })
      .select("id, nickname, is_primary, added_at").single();

    setSavingBike(false);
    if (error) { showToast(error.message); return; }

    const entry = { id: garageRow.id, vehicleId: vehicleRow.id, year: vehicleRow.year, make: vehicleRow.make, model: vehicleRow.model, modelCode: vehicleRow.model_code ?? null, submodel: vehicleRow.submodel, type: vehicleRow.type ?? "motorcycle", nickname: garageRow.nickname, is_primary: isPrimary };
    setVehicles(v => isPrimary ? [entry, ...v] : [...v, entry]);
    setShowAddBike(false);
    setBikeYear(""); setBikeModel(""); setBikeModelCode(null); setBikeNick("");
    showToast(`${bikeYear} ${HD_MAKE} ${bikeModel} added`);
  };

  const handleSetPrimary = async (id) => {
    await supabase.from("user_garage").update({ is_primary: false }).eq("user_id", user.id);
    await supabase.from("user_garage").update({ is_primary: true }).eq("id", id);
    setVehicles(v => v.map(veh => ({ ...veh, is_primary: veh.id === id })));
    showToast("Primary vehicle updated");
  };

  const handleRemoveBike = async (id) => {
    await supabase.from("user_garage").delete().eq("id", id);
    setVehicles(v => v.filter(veh => veh.id !== id));
    showToast("Vehicle removed");
  };

  // ── Wishlist handlers ───────────────────────────────────────
  const handleRemoveWishlist = async (wishlistId) => {
    await supabase.from("wishlists").delete().eq("id", wishlistId);
    setWishlistItems(prev => prev.filter(i => i.wishlistId !== wishlistId));
    showToast("Removed from wishlist");
  };
  const handleToggleNotify = async (wishlistId, current) => {
    await supabase.from("wishlists").update({ notify_in_stock: !current }).eq("id", wishlistId);
    setWishlistItems(prev => prev.map(i => i.wishlistId === wishlistId ? { ...i, notifyInStock: !current } : i));
  };

  // ── Points ──────────────────────────────────────────────────
  const tier     = getTier(user.points);
  const nextTier = TIER_THRESHOLDS[TIER_THRESHOLDS.indexOf(tier) + 1];
  const tierPct  = nextTier ? Math.min(100, ((user.points - tier.min) / (nextTier.min - tier.min)) * 100) : 100;

  const B = s => ({ fontFamily:"var(--font-caesar),sans-serif",     ...s });
  const M = s => ({ fontFamily:"var(--font-stencil),monospace", ...s });
  const Toggle = ({ on, onChange }) => (
    <div className={`gh-toggle ${on?"on":"off"}`} onClick={() => onChange(!on)}>
      <div className="gh-toggle-thumb"/>
    </div>
  );

  return (
    <div className="gh-wrap">
      <style>{css}</style>

      {/* HEADER */}
      <div className="gh-header">
        <div className="gh-header-inner">
          <div className="gh-header-top">
            <div>
              <div className="gh-eyebrow">MY GARAGE</div>
              <div className="gh-name">
                {(firstName || user.email.split("@")[0]).toUpperCase()}<span>'S</span> GARAGE
              </div>
              <div className="gh-email">{user.email} · Member since {new Date(user.memberSince).getFullYear()}</div>
            </div>
            <div className="gh-stats">
              <div className="gh-stat">
                <div className="gh-stat-val" style={{color:"#c9a84c"}}>{user.points.toLocaleString()}</div>
                <div className="gh-stat-label">POINTS</div>
              </div>
              <div className="gh-stat">
                <div className="gh-stat-val">{vehicles.length}</div>
                <div className="gh-stat-label">VEHICLES</div>
              </div>
              <div className="gh-stat">
                <div className="gh-stat-val">{wishlistItems.length}</div>
                <div className="gh-stat-label">WISHLIST</div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="gh-tabs">
            {["PROFILE","BIKES","POINTS","WISHLIST","ORDERS"].map(t => (
              <button key={t} className={`gh-tab ${tab===t?"active":""}`} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>
        </div>
      </div>

      {/* BODY */}
      <div className="gh-body">

        {/* ══ PROFILE TAB ══ */}
        {tab === "PROFILE" && (
          <>
            {/* Personal info */}
            <div className="gh-card">
              <div className="gh-card-head">
                <div className="gh-card-title">PERSONAL <span>INFO</span></div>
                {!editing
                  ? <button className="btn-ghost" onClick={() => setEditing(true)}>EDIT</button>
                  : <div style={{display:"flex", gap:8}}>
                      <button className="btn-ghost" onClick={() => setEditing(false)}>CANCEL</button>
                      <button className="btn-orange" onClick={handleSaveProfile} disabled={savingProfile}>
                        {savingProfile ? "SAVING..." : "SAVE CHANGES"}
                      </button>
                    </div>
                }
              </div>
              <div className="gh-card-body">
                <div className="gh-grid-2" style={{gap:14}}>
                  <div className="gh-field">
                    <label className="gh-label">FIRST NAME</label>
                    {editing ? <input className="gh-input" value={firstName} onChange={e=>setFirstName(e.target.value)}/> : <div style={{fontSize:15,fontWeight:600,padding:"9px 0",color:"#f0ebe3"}}>{firstName||"—"}</div>}
                  </div>
                  <div className="gh-field">
                    <label className="gh-label">LAST NAME</label>
                    {editing ? <input className="gh-input" value={lastName} onChange={e=>setLastName(e.target.value)}/> : <div style={{fontSize:15,fontWeight:600,padding:"9px 0",color:"#f0ebe3"}}>{lastName||"—"}</div>}
                  </div>
                  <div className="gh-field">
                    <label className="gh-label">EMAIL ADDRESS</label>
                    <div style={{fontSize:15,fontWeight:600,padding:"9px 0",color:"#f0ebe3"}}>{user.email}</div>
                  </div>
                  <div className="gh-field">
                    <label className="gh-label">PHONE</label>
                    {editing ? <input className="gh-input" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="555-555-5555"/> : <div style={{fontSize:15,fontWeight:600,padding:"9px 0",color:"#f0ebe3"}}>{phone||"—"}</div>}
                  </div>
                </div>
              </div>
            </div>

            {/* Addresses */}
            <div className="gh-card">
              <div className="gh-card-head">
                <div className="gh-card-title">SAVED <span>ADDRESSES</span></div>
                <button className="btn-ghost" onClick={() => setShowAddrForm(true)}>+ ADD ADDRESS</button>
              </div>
              <div className="gh-card-body">
                {addresses.length === 0 ? (
                  <div style={{padding:"24px 0", textAlign:"center"}}>
                    <div style={B({fontSize:20, letterSpacing:"0.05em", color:"#3a3838", marginBottom:5})}>NO ADDRESSES SAVED</div>
                    <div style={M({fontSize:9, color:"#8a8784", letterSpacing:"0.1em"})}>ADD AN ADDRESS TO SPEED UP CHECKOUT</div>
                  </div>
                ) : (
                  addresses.map(addr => (
                    <div key={addr.id} className={`addr-card ${addr.is_default?"default":""}`}>
                      {addr.is_default && <div className="addr-default-badge">★ DEFAULT</div>}
                      <div className="addr-name">{addr.first_name} {addr.last_name}</div>
                      <div className="addr-text">
                        {addr.address1}{addr.address2 ? `, ${addr.address2}` : ""}<br/>
                        {addr.city}, {addr.state} {addr.zip} · {addr.country}
                      </div>
                      <div className="addr-actions">
                        {!addr.is_default && <button className="btn-ghost" onClick={() => handleSetDefaultAddress(addr.id)}>SET DEFAULT</button>}
                        <button className="btn-danger" onClick={() => handleRemoveAddress(addr.id)}>REMOVE</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Security */}
            <div className="gh-card">
              <div className="gh-card-head">
                <div className="gh-card-title">ACCOUNT <span>SECURITY</span></div>
              </div>
              <div className="gh-card-body" style={{display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12}}>
                <div>
                  <div style={{fontSize:14, fontWeight:600, color:"#f0ebe3", marginBottom:3}}>Password</div>
                  <div style={M({fontSize:9, color:"#8a8784", letterSpacing:"0.1em"})}>SEND A MAGIC LINK TO RESET</div>
                </div>
                <div style={{display:"flex", gap:10}}>
                  <button className="btn-ghost" onClick={async () => {
                    await supabase.auth.signInWithOtp({ email: user.email, options: { emailRedirectTo: `${window.location.origin}/garage` }});
                    showToast("Reset link sent to " + user.email);
                  }}>SEND RESET LINK</button>
                  <button className="btn-danger" onClick={handleSignOut}>SIGN OUT</button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ══ BIKES TAB ══ */}
        {tab === "BIKES" && (
          <>
            <div className="gh-card">
              <div className="gh-card-head">
                <div className="gh-card-title">YOUR <span>VEHICLES</span></div>
                <button className="btn-orange" onClick={() => setShowAddBike(true)}>+ ADD VEHICLE</button>
              </div>
              <div className="gh-card-body">
                {vehicles.length === 0 ? (
                  <div className="gh-empty">
                    <div className="gh-empty-title">NO VEHICLES YET</div>
                    <div className="gh-empty-sub">ADD YOUR FIRST BIKE TO GET FITMENT-SPECIFIC RESULTS</div>
                    <button className="btn-orange" onClick={() => setShowAddBike(true)}>+ ADD YOUR FIRST VEHICLE</button>
                  </div>
                ) : (
                  <div className="bikes-grid">
                    {vehicles.map((v, i) => (
                      <div key={v.id} className={`bike-card ${v.is_primary?"primary":""}`} style={{animationDelay:`${i*0.05}s`}}>
                        <div style={{display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:6}}>
                          <div className="bike-year">{v.year}</div>
                          {v.is_primary && <span style={M({fontSize:7, background:"rgba(232,98,26,0.12)", border:"1px solid rgba(232,98,26,0.3)", color:"#e8621a", padding:"2px 7px", borderRadius:2, letterSpacing:"0.12em"})}>★ PRIMARY</span>}
                        </div>
                        <div className="bike-name">{v.make} {v.model}</div>
                        <div className="bike-meta">{v.year} · {v.type?.toUpperCase() ?? "MOTORCYCLE"}{v.nickname ? ` · "${v.nickname}"` : ""}</div>
                        <div className="bike-actions">
                          <button className="btn-orange" style={{fontSize:13, padding:"5px 12px"}} onClick={() => window.location.href = buildShopUrl(v)}>SHOP PARTS →</button>
                          {!v.is_primary && <button className="btn-ghost" onClick={() => handleSetPrimary(v.id)}>SET PRIMARY</button>}
                          <button className="btn-danger" onClick={() => handleRemoveBike(v.id)}>REMOVE</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ══ POINTS TAB ══ */}
        {tab === "POINTS" && (
          <>
            <div className="points-grid">
              <div className="points-stat gold">
                <div className="points-val">{user.points.toLocaleString()}</div>
                <div className="points-lbl">POINTS BALANCE</div>
              </div>
              <div className="points-stat">
                <div className="points-val">${(user.points * POINTS_TO_DOLLAR).toFixed(2)}</div>
                <div className="points-lbl">CASH VALUE</div>
              </div>
              <div className="points-stat">
                <div className="points-val">{user.orderCount}</div>
                <div className="points-lbl">TOTAL ORDERS</div>
              </div>
              <div className="points-stat">
                <div className="points-val">${Number(user.lifetimeSpend).toFixed(0)}</div>
                <div className="points-lbl">LIFETIME SPEND</div>
              </div>
            </div>

            {/* Tier */}
            <div className="gh-card">
              <div className="gh-card-head"><div className="gh-card-title">YOUR <span>TIER</span></div></div>
              <div className="gh-card-body">
                <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10}}>
                  <div style={B({fontSize:30, letterSpacing:"0.06em", color:tier.color})}>{tier.name}</div>
                  {nextTier && <div style={{textAlign:"right"}}>
                    <div style={M({fontSize:8, color:"#8a8784", letterSpacing:"0.1em"})}>NEXT: {nextTier.name}</div>
                    <div style={M({fontSize:9, color:"#f0ebe3"})}>{(nextTier.min - user.points).toLocaleString()} PTS AWAY</div>
                  </div>}
                </div>
                <div className="tier-track"><div className="tier-fill" style={{width:`${tierPct}%`}}/></div>
                <div className="tier-labels">
                  <span>{tier.name} ({tier.min.toLocaleString()})</span>
                  {nextTier && <span>{nextTier.name} ({nextTier.min.toLocaleString()})</span>}
                </div>
              </div>
            </div>

            {/* How to earn */}
            <div className="gh-card">
              <div className="gh-card-head"><div className="gh-card-title">HOW TO <span>EARN</span></div></div>
              <div className="gh-card-body">
                <div className="how-grid">
                  {[["10× PTS","Earn 10 points for every $1 spent"],["2× PTS","Double points on your birthday month"],["500 PTS","Refer a friend who makes their first purchase"],["100 PTS","Leave a verified product review"]].map(([r,d])=>(
                    <div key={r} className="how-card"><div className="how-rate">{r}</div><div className="how-desc">{d}</div></div>
                  ))}
                </div>
              </div>
            </div>

            {/* Ledger */}
            <div className="gh-card">
              <div className="gh-card-head"><div className="gh-card-title">POINTS <span>HISTORY</span></div></div>
              {ledger.length === 0 ? (
                <div style={{padding:"32px", textAlign:"center", ...M({fontSize:9, color:"#8a8784", letterSpacing:"0.12em"})}}>
                  NO ACTIVITY YET — MAKE YOUR FIRST PURCHASE TO START EARNING
                </div>
              ) : (
                <table className="ledger-table">
                  <thead><tr><th>DATE</th><th>DESCRIPTION</th><th>TYPE</th><th style={{textAlign:"right"}}>POINTS</th></tr></thead>
                  <tbody>
                    {ledger.map(row => (
                      <tr key={row.id}>
                        <td style={M({fontSize:9, color:"#8a8784"})}>{new Date(row.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</td>
                        <td style={{color:"#f0ebe3"}}>{row.description ?? "—"}</td>
                        <td><span className={getLedgerClass(row.type)} style={M({fontSize:8, letterSpacing:"0.1em"})}>{row.type?.toUpperCase()??""}</span></td>
                        <td style={{textAlign:"right",...B({fontSize:18, letterSpacing:"0.04em"})}}>
                          <span className={row.points>0?"pts-earn":"pts-redeem"}>{row.points>0?"+":""}{row.points.toLocaleString()}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* ══ WISHLIST TAB ══ */}
        {tab === "WISHLIST" && (
          <div className="gh-card">
            <div className="gh-card-head">
              <div className="gh-card-title">SAVED <span>PARTS</span></div>
              <a href="/browse" style={{...M({fontSize:9, letterSpacing:"0.12em"}), color:"#8a8784", textDecoration:"none"}}>BROWSE MORE →</a>
            </div>
            <div className="gh-card-body">
              {wishlistItems.length === 0 ? (
                <div className="gh-empty">
                  <div style={{fontSize:36, marginBottom:12, opacity:0.2}}>♡</div>
                  <div className="gh-empty-title">WISHLIST IS EMPTY</div>
                  <div className="gh-empty-sub">SAVE PARTS FROM ANY PRODUCT PAGE</div>
                  <button className="btn-orange" onClick={() => window.location.href = "/browse"}>BROWSE PARTS</button>
                </div>
              ) : (
                <div className="wl-grid">
                  {wishlistItems.map((item, i) => (
                    <div key={item.wishlistId} className="wl-card" style={{animationDelay:`${i*0.04}s`}}>
                      <div className="wl-img" onClick={() => window.location.href=`/browse/${item.slug}`}>
                        <span style={M({fontSize:8, color:"#3a3838", letterSpacing:"0.1em", position:"relative", zIndex:1})}>NO IMAGE</span>
                      </div>
                      <div className="wl-body">
                        <div className="wl-brand">{item.brand}</div>
                        <div className="wl-name" onClick={() => window.location.href=`/browse/${item.slug}`}>{item.name}</div>
                        <div className="wl-price">${item.price.toFixed(2)}</div>
                        <div className={`wl-stock ${item.inStock?"wl-in":"wl-out"}`}>{item.inStock?"✓ IN STOCK":"✗ OUT OF STOCK"}</div>
                        <div className="wl-actions">
                          <button className="btn-orange" style={{flex:1, fontSize:13, padding:"6px"}} disabled={!item.inStock} onClick={() => { if(item.inStock){ setCartCount(c=>c+1); showToast(item.name.split(" ").slice(0,3).join(" ")+" added to cart"); }}}>
                            {item.inStock ? "ADD TO CART" : "OUT OF STOCK"}
                          </button>
                          <button className="btn-danger" style={{padding:"6px 10px"}} onClick={() => handleRemoveWishlist(item.wishlistId)}>✕</button>
                        </div>
                        {!item.inStock && (
                          <div className="wl-notify">
                            <span className="wl-notify-lbl">NOTIFY WHEN IN STOCK</span>
                            <Toggle on={item.notifyInStock} onChange={() => handleToggleNotify(item.wishlistId, item.notifyInStock)}/>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ ORDERS TAB ══ */}
        {tab === "ORDERS" && (
          <div className="gh-card">
            <div className="gh-card-head">
              <div className="gh-card-title">ORDER <span>HISTORY</span></div>
            </div>
            <div className="gh-card-body">
              {orders.length === 0 ? (
                <div className="gh-empty">
                  <div className="gh-empty-title">NO ORDERS YET</div>
                  <div className="gh-empty-sub">YOUR ORDER HISTORY WILL APPEAR HERE AFTER YOUR FIRST PURCHASE</div>
                  <button className="btn-orange" onClick={() => window.location.href = "/browse"}>SHOP NOW</button>
                </div>
              ) : (
                orders.map(order => (
                  <div key={order.id} className="order-row">
                    <div className="order-row-head">
                      <span className="order-id">#{order.id.slice(0,8).toUpperCase()}</span>
                      <span className="order-date">{new Date(order.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</span>
                      <span className="order-status" style={{background:`${STATUS_COLORS[order.status]}20`, color:STATUS_COLORS[order.status]||"#8a8784", border:`1px solid ${STATUS_COLORS[order.status]}44`}}>
                        {order.status?.toUpperCase()}
                      </span>
                      <span className="order-total">${Number(order.total_amount).toFixed(2)}</span>
                    </div>
                    {order.order_items?.length > 0 && (
                      <div className="order-items">
                        {order.order_items.map(line => (
                          <div key={line.id} className="order-item">
                            <span>{line.quantity}× {line.products?.name ?? "Product"}</span>
                            <span>${(line.unit_price * line.quantity).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

      </div>

      {/* ══ ADD ADDRESS MODAL ══ */}
      {showAddrForm && (
        <div className="gh-modal-overlay">
          <div className="gh-modal">
            <div className="gh-modal-title">
              ADD <span>ADDRESS</span>
              <button className="gh-modal-close" onClick={() => setShowAddrForm(false)}>✕</button>
            </div>
            <div className="gh-grid-2" style={{gap:12, marginBottom:12}}>
              <div className="gh-field"><label className="gh-label">FIRST NAME</label><input className="gh-input" value={newAddr.first_name} onChange={e=>setNewAddr(a=>({...a,first_name:e.target.value}))} placeholder="John"/></div>
              <div className="gh-field"><label className="gh-label">LAST NAME</label><input className="gh-input" value={newAddr.last_name} onChange={e=>setNewAddr(a=>({...a,last_name:e.target.value}))} placeholder="Doe"/></div>
            </div>
            <div className="gh-field" style={{marginBottom:12}}>
              <label className="gh-label">STREET ADDRESS</label>
              <AddressAutocomplete
                placeholder="Start typing your address..."
                onSelect={parsed => setNewAddr(a => ({
                  ...a,
                  address1: parsed.address_line1,
                  city:      parsed.city,
                  state:     parsed.state,
                  zip:       parsed.zip,
                  country:   parsed.country || "US",
                }))}
                onChange={handleStreetInputChange}
              />
            </div>
            <div className="gh-field" style={{marginBottom:12}}>
              <label className="gh-label">APT / SUITE (OPTIONAL)</label>
              <input className="gh-input" value={newAddr.address2} onChange={e=>setNewAddr(a=>({...a,address2:e.target.value}))} placeholder="Apt 4B"/>
            </div>
            <div style={{display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:12, marginBottom:12}}>
              <div className="gh-field"><label className="gh-label">CITY</label><input className="gh-input" value={newAddr.city} onChange={e=>setNewAddr(a=>({...a,city:e.target.value}))} placeholder="Palm Coast"/></div>
              <div className="gh-field"><label className="gh-label">STATE</label><input className="gh-input" value={newAddr.state} onChange={e=>setNewAddr(a=>({...a,state:e.target.value}))} placeholder="FL" maxLength={2}/></div>
              <div className="gh-field"><label className="gh-label">ZIP</label><input className="gh-input" value={newAddr.zip} onChange={e=>setNewAddr(a=>({...a,zip:e.target.value}))} placeholder="32137"/></div>
            </div>
            <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 0", borderTop:"1px solid #1a1919", marginBottom:16}}>
              <span style={M({fontSize:9, color:"#8a8784", letterSpacing:"0.12em"})}>SET AS DEFAULT ADDRESS</span>
              <Toggle on={newAddr.is_default} onChange={v => setNewAddr(a=>({...a,is_default:v}))}/>
            </div>
            <div style={{display:"flex", gap:10}}>
              <button className="btn-ghost" style={{flex:1}} onClick={() => setShowAddrForm(false)}>CANCEL</button>
              <button className="btn-orange" style={{flex:2}} onClick={handleSaveAddress} disabled={savingAddr || !newAddr.address1 || !newAddr.city}>
                {savingAddr ? "SAVING..." : "SAVE ADDRESS"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ ADD BIKE MODAL ══ */}
      {showAddBike && (
        <div className="gh-modal-overlay">
          <div className="gh-modal">
            <div className="gh-modal-title">
              ADD <span>VEHICLE</span>
              <button className="gh-modal-close" onClick={() => setShowAddBike(false)}>✕</button>
            </div>
            <div className="gh-grid-2" style={{gap:12, marginBottom:12}}>
              <div className="gh-field">
                <label className="gh-label">YEAR</label>
                <select className="gh-select" value={bikeYear} onChange={e=>{setBikeYear(e.target.value);setBikeModel("");setBikeModelCode(null);}}>
                  <option value="">Year</option>{YEARS.map(y=><option key={y}>{y}</option>)}
                </select>
              </div>
              <div className="gh-field">
                <label className="gh-label">MODEL</label>
                <select className="gh-select" value={bikeModelCode || ""} onChange={e=>{
                  const code = e.target.value;
                  const found = hdModels.find(x => x.model_code === code);
                  setBikeModelCode(code || null);
                  setBikeModel(found ? titleCase(found.name) : "");
                }} disabled={!bikeYear || loadingHdModels}>
                  <option value="">{loadingHdModels ? "Loading models..." : "Model"}</option>
                  {hdModelGroups.map(g => (
                    <optgroup key={g.family} label={g.family}>
                      {g.models.map(m => (
                        <option key={m.model_code} value={m.model_code}>{m.model_code} — {titleCase(m.name)}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>
            <div className="gh-field" style={{marginBottom:16}}>
              <label className="gh-label">NICKNAME (OPTIONAL)</label>
              <input className="gh-input" value={bikeNick} onChange={e=>setBikeNick(e.target.value)} placeholder='e.g. "The Beast"'/>
            </div>
            <div style={{display:"flex", gap:10}}>
              <button className="btn-ghost" style={{flex:1}} onClick={() => setShowAddBike(false)}>CANCEL</button>
              <button className="btn-orange" style={{flex:2}} onClick={handleAddBike} disabled={!bikeYear||!bikeModel||savingBike}>
                {savingBike ? "SAVING..." : "SAVE TO GARAGE"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="gh-toast">✓ {toast.toUpperCase()}</div>}
    </div>
  );
}
