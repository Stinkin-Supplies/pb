"use client";
// ============================================================
// app/garage/GarageHub.jsx
// ============================================================
// Unified My Garage — 5 tabs in one place:
//   PROFILE · BIKES · POINTS · WISHLIST · ORDERS
// ============================================================

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import AddressAutocomplete from "@/components/AddressAutocomplete";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ── YMM Data ─────────────────────────────────────────────────
const YEARS = Array.from({ length: 35 }, (_, i) => 2025 - i);
const MAKES = ["Harley-Davidson","Indian","Honda","Yamaha","Kawasaki","Suzuki","BMW","KTM","Ducati","Triumph","Victory","Can-Am","Polaris","Arctic Cat","Ski-Doo"];
const MODELS = {
  "Harley-Davidson":["Road King","Road King Special","Street Glide","Street Glide Special","Road Glide","Road Glide Special","Fat Boy","Fat Boy 114","Softail Slim","Low Rider","Low Rider S","Fat Bob","Heritage Classic","Breakout","Sport Glide","Iron 883","Iron 1200","Forty-Eight","Sportster S","Nightster","Pan America 1250"],
  "Indian":["Chief","Chief Bobber","Scout","Scout Bobber","Scout Rogue","Challenger","Challenger Dark Horse","Springfield","Pursuit"],
  "Honda":["Gold Wing","Gold Wing Tour","Shadow Aero","Rebel 300","Rebel 500","Rebel 1100","CBR600RR","CBR1000RR-R","Africa Twin","CB650R"],
  "Yamaha":["V-Star 650","V-Star 950","V-Star 1300","Bolt","YZF-R1","MT-07","MT-09","MT-10","Ténéré 700"],
  "Kawasaki":["Vulcan 900","Vulcan 1700","Vulcan S","Ninja 400","Ninja 650","Ninja ZX-6R","Ninja ZX-10R","Z900","Versys 650"],
  "Suzuki":["Boulevard C50","Boulevard M50","Boulevard M109R","GSX-R600","GSX-R1000","V-Strom 650","V-Strom 1050"],
  "BMW":["R 1250 GS","R 1250 GS Adventure","R 1250 RT","R 18","S 1000 RR","F 850 GS","F 900 R"],
  "KTM":["390 Duke","690 Duke","890 Duke","1290 Super Duke","890 Adventure","1290 Super Adventure","450 SX-F"],
  "Ducati":["Panigale V2","Panigale V4","Monster","Multistrada V4","Scrambler Icon"],
  "Triumph":["Bonneville T100","Bonneville T120","Scrambler 1200","Tiger 900","Tiger 1200","Speed Triple","Speed Twin","Rocket 3"],
};

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
  ::-webkit-scrollbar { width:4px; } ::-webkit-scrollbar-thumb { background:#e8621a; }
  @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes spin { to{transform:rotate(360deg)} }

  .gh-wrap { background:#0a0909; min-height:100vh; color:#f0ebe3; font-family:'Barlow Condensed',sans-serif; }

  /* NAV */
  .gh-nav { position:sticky;top:0;z-index:100;background:rgba(10,9,9,0.96);border-bottom:1px solid #2a2828;height:54px;display:flex;align-items:center;padding:0 24px;gap:14px;backdrop-filter:blur(10px); }
  .gh-logo { font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:0.08em;color:#f0ebe3;text-decoration:none;flex:1; }
  .gh-logo span { color:#e8621a; }
  .gh-nav-link { font-family:'Share Tech Mono',monospace;font-size:10px;letter-spacing:0.12em;color:#8a8784;text-decoration:none;transition:color 0.2s; }
  .gh-nav-link:hover,.gh-nav-link.active { color:#e8621a; }
  .gh-nav-btn { background:#e8621a;border:none;color:#0a0909;font-family:'Bebas Neue',sans-serif;font-size:14px;letter-spacing:0.1em;padding:5px 14px;border-radius:2px;cursor:pointer;text-decoration:none; }

  /* HERO HEADER */
  .gh-header { background:#111010;border-bottom:1px solid #2a2828;padding:24px 24px 0;position:relative;overflow:hidden; }
  .gh-header::before { content:'';position:absolute;inset:0;background-image:linear-gradient(rgba(232,98,26,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(232,98,26,0.03) 1px,transparent 1px);background-size:32px 32px; }
  .gh-header-inner { max-width:1100px;margin:0 auto;position:relative;z-index:1; }
  .gh-header-top { display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px; }
  .gh-eyebrow { font-family:'Share Tech Mono',monospace;font-size:9px;color:#e8621a;letter-spacing:0.25em;margin-bottom:6px; }
  .gh-name { font-family:'Bebas Neue',sans-serif;font-size:44px;letter-spacing:0.04em;line-height:1; }
  .gh-name span { color:#e8621a; }
  .gh-email { font-size:13px;color:#8a8784;margin-top:4px; }
  .gh-stats { display:flex;gap:24px;flex-wrap:wrap; }
  .gh-stat { text-align:right; }
  .gh-stat-val { font-family:'Bebas Neue',sans-serif;font-size:28px;color:#e8621a;letter-spacing:0.04em;line-height:1; }
  .gh-stat-label { font-family:'Share Tech Mono',monospace;font-size:8px;color:#8a8784;letter-spacing:0.12em; }

  /* TABS */
  .gh-tabs { display:flex;gap:0;overflow-x:auto;border-bottom:1px solid #1a1919; }
  .gh-tabs::-webkit-scrollbar { height:2px; }
  .gh-tab { font-family:'Share Tech Mono',monospace;font-size:10px;letter-spacing:0.15em;padding:14px 22px;cursor:pointer;color:#8a8784;border-bottom:2px solid transparent;transition:all 0.2s;white-space:nowrap;background:none;border-left:none;border-right:none;border-top:none; }
  .gh-tab.active { color:#e8621a;border-bottom-color:#e8621a; }
  .gh-tab:hover:not(.active) { color:#f0ebe3; }

  /* BODY */
  .gh-body { max-width:1100px;margin:0 auto;padding:24px;animation:fadeUp 0.25s ease; }

  /* CARDS */
  .gh-card { background:#111010;border:1px solid #2a2828;border-radius:3px;margin-bottom:14px;overflow:hidden; }
  .gh-card-head { padding:14px 18px;border-bottom:1px solid #2a2828;display:flex;align-items:center;justify-content:space-between; }
  .gh-card-title { font-family:'Bebas Neue',sans-serif;font-size:19px;letter-spacing:0.05em; }
  .gh-card-title span { color:#e8621a; }
  .gh-card-body { padding:18px; }

  /* FORM ELEMENTS */
  .gh-field { display:flex;flex-direction:column;gap:5px; }
  .gh-label { font-family:'Share Tech Mono',monospace;font-size:8px;color:#8a8784;letter-spacing:0.15em; }
  .gh-input { background:#1a1919;border:1px solid #2a2828;color:#f0ebe3;font-family:'Barlow Condensed',sans-serif;font-size:15px;font-weight:500;padding:9px 12px;border-radius:2px;outline:none;width:100%;transition:border-color 0.2s; }
  .gh-input:focus { border-color:#e8621a; }
  .gh-input:disabled { opacity:0.5;cursor:not-allowed; }
  .gh-input::placeholder { color:#3a3838; }
  .gh-select { background:#1a1919;border:1px solid #2a2828;color:#f0ebe3;font-family:'Barlow Condensed',sans-serif;font-size:15px;font-weight:500;padding:9px 12px;border-radius:2px;outline:none;appearance:none;cursor:pointer;width:100%;transition:border-color 0.2s; }
  .gh-select:focus { border-color:#e8621a; }
  .gh-select:disabled { opacity:0.4;cursor:not-allowed; }
  .gh-grid-2 { display:grid;grid-template-columns:1fr 1fr;gap:12px; }
  .gh-grid-3 { display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px; }
  .gh-grid-4 { display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px; }
  .gh-full { grid-column:1/-1; }

  /* BUTTONS */
  .btn-orange { background:#e8621a;border:none;color:#0a0909;font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:0.1em;padding:9px 20px;border-radius:2px;cursor:pointer;transition:background 0.2s;white-space:nowrap; }
  .btn-orange:hover { background:#c94f0f; }
  .btn-orange:disabled { opacity:0.4;cursor:not-allowed; }
  .btn-ghost { background:transparent;border:1px solid #2a2828;color:#8a8784;font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:0.12em;padding:7px 14px;border-radius:2px;cursor:pointer;transition:all 0.2s;white-space:nowrap; }
  .btn-ghost:hover { border-color:#e8621a;color:#e8621a; }
  .btn-danger { background:transparent;border:1px solid rgba(185,28,28,0.3);color:#ef4444;font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:0.12em;padding:7px 14px;border-radius:2px;cursor:pointer;transition:all 0.2s;white-space:nowrap; }
  .btn-danger:hover { background:rgba(185,28,28,0.08);border-color:#b91c1c; }

  /* TOGGLE */
  .gh-toggle { width:32px;height:18px;border-radius:9px;position:relative;cursor:pointer;transition:background 0.2s;flex-shrink:0; }
  .gh-toggle.on { background:#e8621a; }
  .gh-toggle.off { background:#2a2828; }
  .gh-toggle-thumb { position:absolute;top:2px;width:14px;height:14px;border-radius:50%;background:#f0ebe3;transition:left 0.2s; }
  .gh-toggle.on .gh-toggle-thumb { left:16px; }
  .gh-toggle.off .gh-toggle-thumb { left:2px; }

  /* BIKE CARDS — Option C */
  .bikes-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px; }
  .bike-card { background:#111010;border:1px solid #2a2828;border-left:3px solid #2a2828;border-radius:0 3px 3px 0;padding:16px;transition:all 0.2s; }
  .bike-card.primary { border-left-color:#e8621a; }
  .bike-card:hover { background:#151414;border-color:rgba(232,98,26,0.25);border-left-color:#e8621a; }
  .bike-year { font-family:'Bebas Neue',sans-serif;font-size:34px;letter-spacing:0.04em;line-height:1; }
  .bike-card.primary .bike-year { color:#e8621a; }
  .bike-card:not(.primary) .bike-year { color:#3a3838; }
  .bike-name { font-family:'Bebas Neue',sans-serif;font-size:17px;letter-spacing:0.04em;color:#f0ebe3;line-height:1.2;margin-bottom:3px; }
  .bike-meta { font-family:'Share Tech Mono',monospace;font-size:8px;color:#8a8784;letter-spacing:0.1em;margin-bottom:10px; }
  .bike-actions { display:flex;gap:7px;flex-wrap:wrap; }

  /* ADDRESS CARDS */
  .addr-card { background:#1a1919;border:1px solid #2a2828;border-radius:2px;padding:14px 16px;margin-bottom:10px; }
  .addr-card.default { border-color:rgba(232,98,26,0.3); }
  .addr-default-badge { font-family:'Share Tech Mono',monospace;font-size:7px;color:#e8621a;letter-spacing:0.15em;border:1px solid rgba(232,98,26,0.25);padding:1px 6px;border-radius:1px;display:inline-block;margin-bottom:6px; }
  .addr-name { font-size:14px;font-weight:700;color:#f0ebe3;margin-bottom:3px; }
  .addr-text { font-size:13px;color:#8a8784;line-height:1.5; }
  .addr-actions { display:flex;gap:8px;margin-top:10px; }

  /* POINTS */
  .points-grid { display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px; }
  .points-stat { background:#0a0909;border:1px solid #2a2828;border-radius:2px;padding:14px; }
  .points-stat.gold { border-color:rgba(201,168,76,0.25);background:rgba(201,168,76,0.04); }
  .points-val { font-family:'Bebas Neue',sans-serif;font-size:32px;letter-spacing:0.04em;line-height:1;margin-bottom:3px; }
  .points-stat.gold .points-val { color:#c9a84c; }
  .points-lbl { font-family:'Share Tech Mono',monospace;font-size:8px;color:#8a8784;letter-spacing:0.12em; }
  .tier-track { height:5px;background:#2a2828;border-radius:3px;overflow:hidden;margin:10px 0 5px; }
  .tier-fill { height:100%;background:linear-gradient(90deg,#e8621a,#c9a84c);border-radius:3px;transition:width 0.6s ease; }
  .tier-labels { display:flex;justify-content:space-between;font-family:'Share Tech Mono',monospace;font-size:8px;color:#8a8784;letter-spacing:0.08em; }
  .how-grid { display:grid;grid-template-columns:1fr 1fr;gap:8px; }
  .how-card { background:#1a1919;border:1px solid #2a2828;border-radius:2px;padding:12px 14px; }
  .how-rate { font-family:'Bebas Neue',sans-serif;font-size:24px;color:#e8621a;letter-spacing:0.04em;line-height:1;margin-bottom:3px; }
  .how-desc { font-size:13px;font-weight:500;color:#8a8784;line-height:1.4; }
  .ledger-table { width:100%;border-collapse:collapse; }
  .ledger-table th { font-family:'Share Tech Mono',monospace;font-size:8px;color:#8a8784;letter-spacing:0.12em;padding:8px 10px;text-align:left;border-bottom:1px solid #2a2828; }
  .ledger-table td { padding:10px;border-bottom:1px solid #1a1919;font-size:13px;font-weight:500; }
  .ledger-table tr:last-child td { border-bottom:none; }
  .pts-earn { color:#22c55e; } .pts-redeem { color:#e8621a; } .pts-expire { color:#8a8784; }

  /* WISHLIST */
  .wl-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px; }
  .wl-card { background:#111010;border:1px solid #2a2828;border-radius:3px;overflow:hidden;transition:all 0.2s; }
  .wl-card:hover { border-color:rgba(232,98,26,0.35);transform:translateY(-2px); }
  .wl-img { width:100%;aspect-ratio:4/3;background:#1a1919;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;cursor:pointer; }
  .wl-img::before { content:'';position:absolute;inset:0;background-image:linear-gradient(rgba(232,98,26,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(232,98,26,0.04) 1px,transparent 1px);background-size:16px 16px; }
  .wl-body { padding:12px; }
  .wl-brand { font-family:'Share Tech Mono',monospace;font-size:9px;color:#e8621a;letter-spacing:0.12em;margin-bottom:3px; }
  .wl-name { font-size:13px;font-weight:700;color:#f0ebe3;line-height:1.3;margin-bottom:7px;cursor:pointer; }
  .wl-price { font-family:'Bebas Neue',sans-serif;font-size:20px;color:#f0ebe3;letter-spacing:0.04em;margin-bottom:8px; }
  .wl-stock { font-family:'Share Tech Mono',monospace;font-size:8px;letter-spacing:0.1em;margin-bottom:8px; }
  .wl-in { color:#22c55e; } .wl-out { color:#8a8784; }
  .wl-actions { display:flex;gap:7px; }
  .wl-notify { display:flex;align-items:center;gap:7px;margin-top:8px;padding-top:8px;border-top:1px solid #1a1919; }
  .wl-notify-lbl { font-family:'Share Tech Mono',monospace;font-size:8px;color:#8a8784;letter-spacing:0.08em;flex:1; }

  /* ORDERS */
  .order-row { border:1px solid #2a2828;border-radius:2px;margin-bottom:8px;overflow:hidden; }
  .order-row-head { display:flex;align-items:center;gap:14px;padding:13px 16px;background:#111010;flex-wrap:wrap; }
  .order-id { font-family:'Share Tech Mono',monospace;font-size:10px;color:#8a8784;letter-spacing:0.1em; }
  .order-date { font-family:'Share Tech Mono',monospace;font-size:9px;color:#8a8784;letter-spacing:0.08em; }
  .order-status { font-family:'Share Tech Mono',monospace;font-size:8px;letter-spacing:0.12em;padding:2px 8px;border-radius:1px; }
  .order-total { font-family:'Bebas Neue',sans-serif;font-size:18px;color:#f0ebe3;letter-spacing:0.04em;margin-left:auto; }
  .order-items { padding:10px 16px;background:#0a0909;border-top:1px solid #1a1919; }
  .order-item { display:flex;justify-content:space-between;font-size:13px;font-weight:500;color:#8a8784;padding:4px 0; }
  .order-item span:last-child { color:#f0ebe3; }

  /* MODALS */
  .gh-modal-overlay { position:fixed;inset:0;z-index:300;background:rgba(0,0,0,0.8);backdrop-filter:blur(4px);display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto; }
  .gh-modal { background:#111010;border:1px solid #2a2828;border-radius:4px;padding:24px;width:100%;max-width:500px;margin:auto;position:relative; }
  .gh-modal-title { font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:0.05em;margin-bottom:18px;display:flex;align-items:center;justify-content:space-between; }
  .gh-modal-title span { color:#e8621a; }
  .gh-modal-close { background:none;border:none;color:#8a8784;font-size:18px;cursor:pointer;transition:color 0.15s; }
  .gh-modal-close:hover { color:#f0ebe3; }

  /* EMPTY STATE */
  .gh-empty { padding:48px;text-align:center; }
  .gh-empty-title { font-family:'Bebas Neue',sans-serif;font-size:26px;letter-spacing:0.05em;color:#3a3838;margin-bottom:6px; }
  .gh-empty-sub { font-family:'Share Tech Mono',monospace;font-size:9px;color:#8a8784;letter-spacing:0.12em;margin-bottom:18px; }

  /* TOAST */
  .gh-toast { position:fixed;bottom:24px;right:24px;z-index:400;background:#22c55e;color:#0a0909;font-family:'Bebas Neue',sans-serif;font-size:15px;letter-spacing:0.1em;padding:11px 22px;border-radius:2px;box-shadow:0 8px 32px rgba(0,0,0,0.4);animation:fadeUp 0.25s ease; }

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
export default function GarageHub({ user, initialAddresses, initialVehicles, ledger, wishlist, orders }) {
  const [tab, setTab] = useState("PROFILE");

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
  const [savingAddr,   setSavingAddr]   = useState(false);

  // Bikes state
  const [vehicles,  setVehicles]  = useState(initialVehicles);
  const [showAddBike, setShowAddBike] = useState(false);
  const [bikeYear,  setBikeYear]  = useState("");
  const [bikeMake,  setBikeMake]  = useState("");
  const [bikeModel, setBikeModel] = useState("");
  const [bikeNick,  setBikeNick]  = useState("");
  const [savingBike, setSavingBike] = useState(false);
  const bikeModels = bikeMake ? (MODELS[bikeMake] ?? []) : [];

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
    if (!bikeYear || !bikeMake || !bikeModel) return;
    setSavingBike(true);
    const isPrimary = vehicles.length === 0;

    let vehicleRow = null;
    const { data: existing } = await supabase.from("vehicles")
      .select("id, year, make, model, submodel, type")
      .eq("year", parseInt(bikeYear)).eq("make", bikeMake).eq("model", bikeModel)
      .limit(1).maybeSingle();

    if (existing) {
      vehicleRow = existing;
    } else {
      const { data: created, error: cErr } = await supabase.from("vehicles")
        .insert({ year: parseInt(bikeYear), make: bikeMake, model: bikeModel, type: "motorcycle" })
        .select("id, year, make, model, submodel, type").single();
      if (cErr) { setSavingBike(false); showToast(cErr.message); return; }
      vehicleRow = created;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const { data: garageRow, error } = await supabase.from("user_garage")
      .insert({ user_id: session.user.id, vehicle_id: vehicleRow.id, nickname: bikeNick || null, is_primary: isPrimary })
      .select("id, nickname, is_primary, added_at").single();

    setSavingBike(false);
    if (error) { showToast(error.message); return; }

    const entry = { id: garageRow.id, vehicleId: vehicleRow.id, year: vehicleRow.year, make: vehicleRow.make, model: vehicleRow.model, submodel: vehicleRow.submodel, type: vehicleRow.type ?? "motorcycle", nickname: garageRow.nickname, is_primary: isPrimary };
    setVehicles(v => isPrimary ? [entry, ...v] : [...v, entry]);
    setShowAddBike(false);
    setBikeYear(""); setBikeMake(""); setBikeModel(""); setBikeNick("");
    showToast(`${bikeYear} ${bikeMake} ${bikeModel} added`);
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

  const B = s => ({ fontFamily:"'Bebas Neue',sans-serif",     ...s });
  const M = s => ({ fontFamily:"'Share Tech Mono',monospace", ...s });
  const Toggle = ({ on, onChange }) => (
    <div className={`gh-toggle ${on?"on":"off"}`} onClick={() => onChange(!on)}>
      <div className="gh-toggle-thumb"/>
    </div>
  );

  return (
    <div className="gh-wrap">
      <style>{css}</style>

      {/* NAV */}
      <nav className="gh-nav">
        <a href="/" className="gh-logo">STINKIN<span>'</span> SUPPLIES</a>
        {[["Shop","/shop"],["Brands","/brands"],["Deals","/shop?badge=sale"],["Search","/search"]].map(([l,h]) => (
          <a key={l} href={h} className="gh-nav-link">{l}</a>
        ))}
        <a href="/garage" className="gh-nav-link active">MY GARAGE</a>
        <a href="/garage" className="gh-nav-btn">MY GARAGE</a>
      </nav>

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
                          <button className="btn-orange" style={{fontSize:13, padding:"5px 12px"}} onClick={() => window.location.href = `/shop`}>SHOP PARTS →</button>
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
              <a href="/shop" style={{...M({fontSize:9, letterSpacing:"0.12em"}), color:"#8a8784", textDecoration:"none"}}>BROWSE MORE →</a>
            </div>
            <div className="gh-card-body">
              {wishlistItems.length === 0 ? (
                <div className="gh-empty">
                  <div style={{fontSize:36, marginBottom:12, opacity:0.2}}>♡</div>
                  <div className="gh-empty-title">WISHLIST IS EMPTY</div>
                  <div className="gh-empty-sub">SAVE PARTS FROM ANY PRODUCT PAGE</div>
                  <button className="btn-orange" onClick={() => window.location.href = "/shop"}>BROWSE PARTS</button>
                </div>
              ) : (
                <div className="wl-grid">
                  {wishlistItems.map((item, i) => (
                    <div key={item.wishlistId} className="wl-card" style={{animationDelay:`${i*0.04}s`}}>
                      <div className="wl-img" onClick={() => window.location.href=`/shop/${item.slug}`}>
                        <span style={M({fontSize:8, color:"#3a3838", letterSpacing:"0.1em", position:"relative", zIndex:1})}>NO IMAGE</span>
                      </div>
                      <div className="wl-body">
                        <div className="wl-brand">{item.brand}</div>
                        <div className="wl-name" onClick={() => window.location.href=`/shop/${item.slug}`}>{item.name}</div>
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
                  <button className="btn-orange" onClick={() => window.location.href = "/shop"}>SHOP NOW</button>
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
                    {order.order_line_items?.length > 0 && (
                      <div className="order-items">
                        {order.order_line_items.map(line => (
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
              <AddressAutocomplete placeholder="Start typing your address..." onSelect={parsed => setNewAddr(a => ({...a, address1: parsed.address_line1, city: parsed.city, state: parsed.state, zip: parsed.zip, country: parsed.country || "US"}))}/>
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
            <div className="gh-grid-3" style={{gap:12, marginBottom:12}}>
              <div className="gh-field">
                <label className="gh-label">YEAR</label>
                <select className="gh-select" value={bikeYear} onChange={e=>{setBikeYear(e.target.value);setBikeMake("");setBikeModel("");}}>
                  <option value="">Year</option>{YEARS.map(y=><option key={y}>{y}</option>)}
                </select>
              </div>
              <div className="gh-field">
                <label className="gh-label">MAKE</label>
                <select className="gh-select" value={bikeMake} onChange={e=>{setBikeMake(e.target.value);setBikeModel("");}} disabled={!bikeYear}>
                  <option value="">Make</option>{MAKES.map(m=><option key={m}>{m}</option>)}
                </select>
              </div>
              <div className="gh-field">
                <label className="gh-label">MODEL</label>
                <select className="gh-select" value={bikeModel} onChange={e=>setBikeModel(e.target.value)} disabled={!bikeMake}>
                  <option value="">Model</option>{bikeModels.map(m=><option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div className="gh-field" style={{marginBottom:16}}>
              <label className="gh-label">NICKNAME (OPTIONAL)</label>
              <input className="gh-input" value={bikeNick} onChange={e=>setBikeNick(e.target.value)} placeholder='e.g. "The Beast"'/>
            </div>
            <div style={{display:"flex", gap:10}}>
              <button className="btn-ghost" style={{flex:1}} onClick={() => setShowAddBike(false)}>CANCEL</button>
              <button className="btn-orange" style={{flex:2}} onClick={handleAddBike} disabled={!bikeYear||!bikeMake||!bikeModel||savingBike}>
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
