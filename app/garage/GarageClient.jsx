"use client";
// ============================================================
// app/garage/GarageClient.jsx
// ============================================================
// My Garage page — logged-in users manage their vehicles here.
// Features:
//   - Vehicle cards with blueprint-style SVG illustrations
//   - Add vehicle (YMM selector → saves to user_garage)
//   - Set primary vehicle (used for fitment filtering)
//   - Remove vehicle
//   - Points balance + referral code display
//   - Quick links to shop filtered for each bike
// ============================================================

import { useState } from "react";
import NavBar from "@/components/NavBar";
import { createBrowserClient } from "@supabase/ssr";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ── YMM Data ─────────────────────────────────────────────────
const YEARS = Array.from({ length: 35 }, (_, i) => 2025 - i);
const MAKES = [
  "Harley-Davidson","Indian","Honda","Yamaha","Kawasaki",
  "Suzuki","BMW","KTM","Ducati","Triumph","Victory",
  "Can-Am","Polaris","Arctic Cat","Ski-Doo",
];
const MODELS = {
  "Harley-Davidson": ["Road King","Road King Special","Street Glide","Street Glide Special","Road Glide","Road Glide Special","Fat Boy","Fat Boy 114","Softail Slim","Low Rider","Low Rider S","Fat Bob","Heritage Classic","Breakout","Sport Glide","Iron 883","Iron 1200","Forty-Eight","Sportster S","Nightster","Pan America 1250"],
  "Indian":          ["Chief","Chief Bobber","Chief Dark Horse","Scout","Scout Bobber","Scout Rogue","Challenger","Challenger Dark Horse","Springfield","Springfield Dark Horse","Pursuit","Pursuit Dark Horse"],
  "Honda":           ["Gold Wing","Gold Wing Tour","Shadow Aero","Shadow Phantom","Rebel 300","Rebel 500","Rebel 1100","CBR600RR","CBR1000RR-R","Africa Twin","CB500F","CB1000R","CB650R"],
  "Yamaha":          ["V-Star 650","V-Star 950","V-Star 1300","Bolt","Bolt R-Spec","YZF-R1","YZF-R6","MT-03","MT-07","MT-09","MT-10","Ténéré 700","Super Ténéré"],
  "Kawasaki":        ["Vulcan 900","Vulcan 1700","Vulcan S","Ninja 400","Ninja 650","Ninja ZX-6R","Ninja ZX-10R","Z400","Z650","Z900","Versys 650","Versys 1000"],
  "Suzuki":          ["Boulevard C50","Boulevard M50","Boulevard M109R","GSX-R600","GSX-R750","GSX-R1000","GSX-S750","GSX-S1000","V-Strom 650","V-Strom 1050"],
  "BMW":             ["R 1250 GS","R 1250 GS Adventure","R 1250 RT","R 1250 R","R 18","S 1000 RR","S 1000 R","S 1000 XR","F 850 GS","F 900 R"],
  "KTM":             ["390 Duke","690 Duke","890 Duke","1290 Super Duke","390 Adventure","790 Adventure","890 Adventure","1090 Adventure","1290 Super Adventure","450 SX-F","450 EXC-F"],
  "Ducati":          ["Panigale V2","Panigale V4","Monster","Monster SP","Multistrada V4","Multistrada V4 S","Diavel V4","Scrambler Icon","SuperSport"],
  "Triumph":         ["Bonneville T100","Bonneville T120","Scrambler 900","Scrambler 1200","Tiger 900","Tiger 1200","Speed Triple","Speed Twin","Rocket 3"],
};

// ── Blueprint SVG bike illustrations ─────────────────────────
// Simplified cruiser silhouette — thin stroke, blueprint aesthetic
const css = `
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  ::-webkit-scrollbar { width:4px; } ::-webkit-scrollbar-thumb { background:#e8621a; }
  @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes spin   { to{transform:rotate(360deg)} }

  .garage-wrap { background:#0a0909; min-height:100vh; color:#f0ebe3; font-family:'Barlow Condensed',sans-serif; }

  /* NAV */
  /* HEADER */
  .garage-header { background:#111010;border-bottom:1px solid #2a2828;padding:28px 24px; }
  .garage-header-inner { max-width:1100px;margin:0 auto;display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:16px; }
  .garage-eyebrow { font-family:'Share Tech Mono',monospace;font-size:9px;color:#e8621a;letter-spacing:0.25em;margin-bottom:6px; }
  .garage-title { font-family:'Bebas Neue',sans-serif;font-size:42px;letter-spacing:0.04em;line-height:1; }
  .garage-title span { color:#e8621a; }
  .garage-subtitle { font-size:14px;font-weight:500;color:#8a8784;margin-top:4px; }

  /* STATS STRIP */
  .garage-stats { background:#0a0909;border-bottom:1px solid #2a2828;padding:14px 24px; }
  .garage-stats-inner { max-width:1100px;margin:0 auto;display:flex;align-items:center;gap:32px;flex-wrap:wrap; }
  .g-stat { display:flex;flex-direction:column;gap:2px; }
  .g-stat-val { font-family:'Bebas Neue',sans-serif;font-size:28px;color:#e8621a;letter-spacing:0.05em;line-height:1; }
  .g-stat-label { font-family:'Share Tech Mono',monospace;font-size:8px;color:#8a8784;letter-spacing:0.15em; }
  .g-stat-divider { width:1px;height:36px;background:#2a2828; }
  .referral-chip { display:flex;align-items:center;gap:8px;background:#111010;border:1px solid #2a2828;border-radius:2px;padding:6px 12px;margin-left:auto; }
  .referral-code { font-family:'Share Tech Mono',monospace;font-size:11px;color:#c9a84c;letter-spacing:0.15em; }
  .copy-btn { background:none;border:none;color:#8a8784;cursor:pointer;font-size:12px;transition:color 0.2s;padding:0; }
  .copy-btn:hover { color:#c9a84c; }

  /* MAIN */
  .garage-main { max-width:1100px;margin:0 auto;padding:28px 24px; }
  .section-head { display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;border-bottom:1px solid #2a2828;padding-bottom:12px; }
  .section-title { font-family:'Bebas Neue',sans-serif;font-size:26px;letter-spacing:0.05em; }
  .section-title span { color:#e8621a; }
  .add-bike-btn { background:#e8621a;border:none;color:#0a0909;font-family:'Bebas Neue',sans-serif;font-size:15px;letter-spacing:0.1em;padding:8px 18px;border-radius:2px;cursor:pointer;transition:background 0.2s;display:flex;align-items:center;gap:6px; }
  .add-bike-btn:hover { background:#c94f0f; }

  /* VEHICLE CARDS */
  .vehicles-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;margin-bottom:36px; }

  .vehicle-card {
    background:#111010;
    border:1px solid #2a2828;
    border-left:4px solid #3a3838;
    border-radius:3px;
    overflow:hidden;
    position:relative;
    transition:border-color 0.2s, box-shadow 0.2s, border-left-color 0.2s;
    animation:fadeUp 0.3s ease both;
  }
  .vehicle-card.primary {
    border-left-color:#e8621a;
    border-color:rgba(232,98,26,0.3);
  }
  .vehicle-card:hover {
    border-left-color:#e8621a;
    border-color:rgba(232,98,26,0.35);
    box-shadow:0 20px 32px rgba(232,98,26,0.2);
  }

  .vehicle-card-content {
    padding:24px;
  }
  .vehicle-card-year {
    font-family:'Bebas Neue',sans-serif;
    font-size:44px;
    letter-spacing:0.1em;
    margin-bottom:8px;
    color:#e8621a;
  }
  .vehicle-card-year.secondary {
    color:#3a3838;
  }
  .vehicle-card-name {
    font-family:'Bebas Neue',sans-serif;
    font-size:28px;
    letter-spacing:0.05em;
    margin-bottom:6px;
  }
  .vehicle-card-meta {
    font-family:'Share Tech Mono',monospace;
    font-size:10px;
    letter-spacing:0.25em;
    color:#8a8784;
    text-transform:uppercase;
  }
  .vehicle-card-footer {
    border-top:1px solid #1a1919;
    padding:16px 24px 20px;
  }
  .vehicle-actions { display:flex;gap:8px;flex-wrap:wrap; }
  .veh-btn { font-family:'Share Tech Mono',monospace;font-size:8px;letter-spacing:0.12em;padding:5px 10px;border-radius:2px;cursor:pointer;transition:all 0.2s;border:1px solid; }
  .veh-btn.shop  { background:#e8621a;border-color:#e8621a;color:#0a0909; }
  .veh-btn.shop:hover { background:#c94f0f;border-color:#c94f0f; }
  .veh-btn.primary-btn { background:transparent;border-color:#2a2828;color:#8a8784; }
  .veh-btn.primary-btn:hover { border-color:#e8621a;color:#e8621a; }
  .veh-btn.remove { background:transparent;border-color:#2a2828;color:#8a8784; }
  .veh-btn.remove:hover { border-color:#b91c1c;color:#b91c1c; }

  /* ADD VEHICLE PANEL */
  .add-panel { background:#111010;border:1px solid rgba(232,98,26,0.2);border-radius:3px;padding:24px;margin-bottom:28px;position:relative; }
  .add-panel::before { content:'ADD VEHICLE';position:absolute;top:-1px;left:20px;background:#e8621a;color:#0a0909;font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:0.2em;padding:2px 10px; }
  .add-panel-title { font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:0.05em;margin-bottom:16px;margin-top:8px; }
  .ymm-grid { display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px; }
  .g-select { background:#1a1919;border:1px solid #2a2828;color:#f0ebe3;font-family:'Barlow Condensed',sans-serif;font-size:15px;font-weight:500;padding:10px 12px;border-radius:2px;outline:none;appearance:none;cursor:pointer;transition:border-color 0.2s;width:100%; }
  .g-select:focus { border-color:#e8621a; }
  .g-select:disabled { opacity:0.4;cursor:not-allowed; }
  .nickname-row { display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end; }
  .g-label { font-family:'Share Tech Mono',monospace;font-size:8px;color:#8a8784;letter-spacing:0.15em;display:block;margin-bottom:5px; }
  .g-input { background:#1a1919;border:1px solid #2a2828;color:#f0ebe3;font-family:'Barlow Condensed',sans-serif;font-size:15px;font-weight:500;padding:10px 12px;border-radius:2px;outline:none;width:100%;transition:border-color 0.2s; }
  .g-input:focus { border-color:#e8621a; }
  .save-btn { height:44px;padding:0 24px;background:#e8621a;border:none;color:#0a0909;font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:0.1em;border-radius:2px;cursor:pointer;transition:background 0.2s;white-space:nowrap; }
  .save-btn:hover:not(:disabled) { background:#c94f0f; }
  .save-btn:disabled { opacity:0.4;cursor:not-allowed; }
  .cancel-btn { background:none;border:none;color:#8a8784;font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:0.12em;cursor:pointer;padding:0;margin-top:10px;transition:color 0.2s; }
  .cancel-btn:hover { color:#f0ebe3; }

  /* EMPTY STATE */
  .garage-empty { padding:60px 20px;text-align:center;border:1px dashed #2a2828;border-radius:3px; }
  .garage-empty-title { font-family:'Bebas Neue',sans-serif;font-size:28px;letter-spacing:0.05em;color:#3a3838;margin-bottom:8px; }
  .garage-empty-sub { font-family:'Share Tech Mono',monospace;font-size:9px;color:#8a8784;letter-spacing:0.12em;margin-bottom:20px; }

  /* RECENT ORDERS PLACEHOLDER */
  .orders-placeholder { background:#111010;border:1px solid #2a2828;border-radius:3px;padding:32px;text-align:center; }
  .orders-placeholder-title { font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:0.05em;color:#3a3838;margin-bottom:6px; }
  .orders-placeholder-sub { font-family:'Share Tech Mono',monospace;font-size:9px;color:#8a8784;letter-spacing:0.12em; }

  /* TOAST */
  .g-toast {
    position:fixed;
    bottom:24px;
    right:24px;
    z-index:200;
    background:#22c55e;
    color:#0a0909;
    font-family:'Bebas Neue',sans-serif;
    font-size:15px;
    letter-spacing:0.1em;
    padding:11px 22px;
    border-radius:2px;
    box-shadow:0 8px 32px rgba(0,0,0,0.4);
    animation:fadeUp 0.25s ease;
  }
  .g-toast.error {
    background:#b91c1c;
    color:#fff;
  }
`;

export default function GarageClient({ user, initialVehicles }) {
  const [vehicles,   setVehicles]   = useState(initialVehicles);
  const [showAdd,    setShowAdd]    = useState(initialVehicles.length === 0);
  const [year,       setYear]       = useState("");
  const [make,       setMake]       = useState("");
  const [model,      setModel]      = useState("");
  const [nickname,   setNickname]   = useState("");
  const [bikeStyle,  setBikeStyle]  = useState("cruiser");
  const [saving,     setSaving]     = useState(false);
  const [toast,      setToast]      = useState(null);
  const [codeCopied, setCodeCopied] = useState(false);

  const models = make ? (MODELS[make] ?? []) : [];

  const showToast = (msg, realm = "success") => {
    setToast({ msg, realm });
    setTimeout(() => setToast(null), 2500);
  };

  // ── Add vehicle ───────────────────────────────────────────
  // Step 1: find matching vehicle in vehicles table
  // Step 2: insert into user_garage with vehicle_id FK
  const handleAddVehicle = async () => {
    if (!year || !make || !model) return;
    setSaving(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setSaving(false);
      showToast("Not logged in", "error");
      return;
    }
    const userId = session.user.id;
    const isPrimary = vehicles.length === 0;

    // Look up vehicle record — create it if not yet in catalog
    let vehicleRow = null;
    const { data: existing } = await supabase
      .from("vehicles")
      .select("id, year, make, model, submodel")
      .eq("year",  parseInt(year))
      .eq("make",  make)
      .eq("model", model)
      .limit(1)
      .maybeSingle();

    if (existing) {
      vehicleRow = existing;
    } else {
      // Vehicle not in catalog yet — insert it (pre-vendor-sync fallback)
      const { data: created, error: cErr } = await supabase
        .from("vehicles")
        .insert({ year: parseInt(year), make, model })
        .select("id, year, make, model, submodel")
        .single();
      if (cErr) { 
        console.log("FULL ERROR:", cErr);
        setSaving(false);
        showToast(JSON.stringify(cErr), "error");
        return; 
      }
      vehicleRow = created;
    }

    const { data: garageRow, error } = await supabase
      .from("user_garage")
      .insert({
        user_id:    userId,
        vehicle_id: vehicleRow.id,
        nickname:   nickname || null,
        is_primary: isPrimary,
        color:      bikeStyle,
      })
      .select("id, nickname, is_primary, mileage, color, added_at")
      .single();

    setSaving(false);
    if (error) { 
      console.log("GARAGE INSERT ERROR:", JSON.stringify(error));
      showToast(error.message ?? error.code ?? "garage insert failed", "error");
      return; 
    }

    const newEntry = {
      id:         garageRow.id,
      vehicleId:  vehicleRow.id,
      year:       vehicleRow.year,
      make:       vehicleRow.make,
      model:      vehicleRow.model,
      submodel:   vehicleRow.submodel,
      nickname:   garageRow.nickname,
      color:      bikeStyle,
      is_primary: garageRow.is_primary,
    };

    setVehicles(v => isPrimary ? [newEntry, ...v] : [...v, newEntry]);
    setShowAdd(false);
    setYear(""); setMake(""); setModel(""); setNickname(""); setBikeStyle("cruiser");
    showToast(`${year} ${make} ${model} added to your garage`, "success");
  };

  // ── Set primary ───────────────────────────────────────────
  const handleSetPrimary = async (id) => {
    // Clear all primaries then set new one
    await supabase.from("user_garage").update({ is_primary: false }).eq("user_id", user.id);
    await supabase.from("user_garage").update({ is_primary: true  }).eq("id", id);
    setVehicles(v => v.map(veh => ({ ...veh, is_primary: veh.id === id })));
    showToast("Primary vehicle updated", "success");
  };

  // ── Remove vehicle ────────────────────────────────────────
  const handleRemove = async (id) => {
    await supabase.from("user_garage").delete().eq("id", id);
    setVehicles(v => v.filter(veh => veh.id !== id));
    showToast("Vehicle removed", "success");
  };

  const copyReferral = () => {
    navigator.clipboard?.writeText(user.referral ?? "").catch(() => {});
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const B = s => ({ fontFamily:"'Bebas Neue',sans-serif",     ...s });
  const M = s => ({ fontFamily:"'Share Tech Mono',monospace", ...s });

  const primaryVehicle = vehicles.find(v => v.is_primary);

  return (
    <div className="garage-wrap">
      <style>{css}</style>

      <NavBar activePage="garage" />

      {/* HEADER */}
      <div className="garage-header">
        <div className="garage-header-inner">
          <div>
            <div className="garage-eyebrow">MY GARAGE</div>
            <div className="garage-title">
              {user.firstName ? `${user.firstName.toUpperCase()}'S` : "YOUR"} <span>GARAGE</span>
            </div>
            <div className="garage-subtitle">{user.email}</div>
          </div>
          <button className="add-bike-btn" onClick={() => setShowAdd(s => !s)}>
            + ADD VEHICLE
          </button>
        </div>
      </div>

      {/* STATS */}
      <div className="garage-stats">
        <div className="garage-stats-inner">
          <div className="g-stat">
            <div className="g-stat-val">{vehicles.length}</div>
            <div className="g-stat-label">VEHICLES SAVED</div>
          </div>
          <div className="g-stat-divider"/>
          <div className="g-stat">
            <div className="g-stat-val">{user.points.toLocaleString()}</div>
            <div className="g-stat-label">POINTS BALANCE</div>
          </div>
          <div className="g-stat-divider"/>
          <div className="g-stat">
            <div className="g-stat-val">${(user.points * 0.01).toFixed(2)}</div>
            <div className="g-stat-label">POINTS VALUE</div>
          </div>
          <div className="g-stat-divider"/>
          <div className="g-stat">
            <div className="g-stat-val">
              {new Date(user.memberSince).getFullYear()}
            </div>
            <div className="g-stat-label">MEMBER SINCE</div>
          </div>
          {user.referral && (
            <div className="referral-chip">
              <div>
                <div style={M({fontSize:7, color:"#8a8784", letterSpacing:"0.15em", marginBottom:2})}>YOUR REFERRAL CODE</div>
                <div className="referral-code">{user.referral}</div>
              </div>
              <button className="copy-btn" onClick={copyReferral} title="Copy">
                {codeCopied ? "✓" : "📋"}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="garage-main">

        {/* ADD VEHICLE PANEL */}
        {showAdd && (
          <div className="add-panel">
            <div className="add-panel-title">SELECT YOUR RIDE</div>
            <div className="ymm-grid">
              <div>
                <label className="g-label">YEAR</label>
                <select className="g-select" value={year} onChange={e => { setYear(e.target.value); setMake(""); setModel(""); }}>
                  <option value="">Year</option>
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label className="g-label">MAKE</label>
                <select className="g-select" value={make} onChange={e => { setMake(e.target.value); setModel(""); }} disabled={!year}>
                  <option value="">Make</option>
                  {MAKES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="g-label">MODEL</label>
                <select className="g-select" value={model} onChange={e => setModel(e.target.value)} disabled={!make}>
                  <option value="">Model</option>
                  {models.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="g-label">BIKE STYLE</label>
              <select className="g-select" value={bikeStyle} onChange={e => setBikeStyle(e.target.value)}>
                <option value="cruiser">Cruiser</option>
                <option value="chopper">Chopper</option>
                <option value="sportbike">Sportbike</option>
                <option value="adventure">Adventure</option>
                <option value="dirtbike">Dirtbike</option>
              </select>
            </div>
            <div className="nickname-row">
              <div>
                <label className="g-label">NICKNAME (OPTIONAL)</label>
                <input className="g-input" type="text" placeholder='e.g. "The Beast" or "Daily Rider"' value={nickname} onChange={e => setNickname(e.target.value)}/>
              </div>
              <button className="save-btn" onClick={handleAddVehicle} disabled={!year || !make || !model || saving}>
                {saving ? "SAVING..." : "SAVE TO GARAGE"}
              </button>
            </div>
            {vehicles.length > 0 && (
              <button className="cancel-btn" onClick={() => { setShowAdd(false); setBikeStyle("cruiser"); }}>CANCEL</button>
            )}
          </div>
        )}

        {/* VEHICLES */}
        <div className="section-head">
          <div className="section-title">YOUR <span>VEHICLES</span></div>
        </div>

        {vehicles.length === 0 ? (
          <div className="garage-empty">
            <div style={{marginBottom:20, opacity:0.2}}>
              <div style={{ width:140, height:140, borderRadius:70, border:"1px solid #2a2828", display:"inline-flex", alignItems:"center", justifyContent:"center" }}>
                <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:24, letterSpacing:"0.2em", color:"#8a8784" }}>GARAGE</span>
              </div>
            </div>
            <div className="garage-empty-title">NO VEHICLES YET</div>
            <div className="garage-empty-sub">ADD YOUR FIRST BIKE TO GET FITMENT-SPECIFIC RESULTS</div>
            <button className="add-bike-btn" style={{margin:"0 auto"}} onClick={() => setShowAdd(true)}>
              + ADD YOUR FIRST VEHICLE
            </button>
          </div>
        ) : (
          <div className="vehicles-grid">
            {vehicles.map((v, i) => {
              const metaParts = [];
              if (v.type) metaParts.push(v.type);
              if (v.submodel) metaParts.push(v.submodel);
              if (v.color && !metaParts.includes(v.color)) metaParts.push(v.color);
              const metaText = metaParts.length ? metaParts.join(" · ") : "Motorcycle";
              return (
                <div key={v.id} className={`vehicle-card ${v.is_primary?"primary":""}`} style={{animationDelay:`${i*0.06}s`}}>
                  <div className="vehicle-card-content">
                    <div className={`vehicle-card-year ${v.is_primary ? "" : "secondary"}`}>{v.year || "—"}</div>
                    <div className="vehicle-card-name">{v.make} {v.model}</div>
                    <div className="vehicle-card-meta">{metaText}</div>
                  </div>
                  <div className="vehicle-card-footer">
                    <div className="vehicle-actions">
                      <button className="veh-btn shop" onClick={() => window.location.href = `/shop?fitment=${v.id}`}>
                        SHOP PARTS →
                      </button>
                      {!v.is_primary && (
                        <button className="veh-btn primary-btn" onClick={() => handleSetPrimary(v.id)}>
                          SET PRIMARY
                        </button>
                      )}
                      <button className="veh-btn remove" onClick={() => handleRemove(v.id)}>
                        REMOVE
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* RECENT ORDERS — Phase 4 */}
        <div className="section-head" style={{marginTop:12}}>
          <div className="section-title">RECENT <span>ORDERS</span></div>
          <a href="/account/orders" style={M({fontSize:10, color:"#8a8784", letterSpacing:"0.12em", cursor:"pointer", textDecoration:"none"})}>VIEW ALL →</a>
        </div>
        <div className="orders-placeholder">
          <div className="orders-placeholder-title">NO ORDERS YET</div>
          <div className="orders-placeholder-sub">YOUR ORDER HISTORY WILL APPEAR HERE AFTER YOUR FIRST PURCHASE</div>
        </div>

      </div>

      {toast && (
        <div className={`g-toast ${toast.realm === "error" ? "error" : ""}`}>
          {toast.realm === "success" ? "✓ " : "⚠ "}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
