"use client";
// app/account/AccountClient.jsx
import { useState } from "react";
import NavBar from "@/components/NavBar";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { createBrowserClient } from "@supabase/ssr";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const css = `
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  ::-webkit-scrollbar { width:4px; } ::-webkit-scrollbar-thumb { background:#e8621a; }
  @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  .acc-wrap { background:#0a0909; min-height:100vh; color:#f0ebe3; font-family:'Barlow Condensed',sans-serif; }
  .acc-header { background:#111010;border-bottom:1px solid #2a2828;padding:28px 24px; }
  .acc-header-inner { max-width:900px;margin:0 auto;display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap; }
  .acc-tabs { background:#0a0909;border-bottom:1px solid #2a2828;padding:0 24px;display:flex;gap:0;overflow-x:auto; }
  .acc-tab { font-family:'Share Tech Mono',monospace;font-size:10px;letter-spacing:0.15em;padding:14px 20px;cursor:pointer;color:#8a8784;border-bottom:2px solid transparent;transition:all 0.2s;white-space:nowrap;background:none;border-left:none;border-right:none;border-top:none; }
  .acc-tab.active { color:#e8621a;border-bottom-color:#e8621a; }
  .acc-tab:hover:not(.active) { color:#f0ebe3; }
  .acc-body { max-width:900px;margin:0 auto;padding:28px 24px; }
  .acc-section { background:#111010;border:1px solid #2a2828;border-radius:3px;margin-bottom:16px;overflow:hidden;animation:fadeUp 0.25s ease both; }
  .acc-section-head { padding:16px 20px;border-bottom:1px solid #2a2828;display:flex;align-items:center;justify-content:space-between; }
  .acc-section-title { font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:0.05em; }
  .acc-section-title span { color:#e8621a; }
  .acc-section-body { padding:20px; }
  .field-grid { display:grid;grid-template-columns:1fr 1fr;gap:14px; }
  .field-full { grid-column:1/-1; }
  .field-label { font-family:'Share Tech Mono',monospace;font-size:8px;color:#8a8784;letter-spacing:0.15em;display:block;margin-bottom:5px; }
  .field-input { background:#1a1919;border:1px solid #2a2828;color:#f0ebe3;font-family:'Barlow Condensed',sans-serif;font-size:15px;font-weight:500;padding:10px 12px;border-radius:2px;outline:none;width:100%;transition:border-color 0.2s; }
  .field-input:focus { border-color:#e8621a; }
  .field-input:disabled { opacity:0.5;cursor:not-allowed; }
  .field-value { font-size:15px;font-weight:600;color:#f0ebe3;padding:10px 0; }
  .save-btn { background:#e8621a;border:none;color:#0a0909;font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:0.1em;padding:10px 24px;border-radius:2px;cursor:pointer;transition:background 0.2s; }
  .save-btn:hover { background:#c94f0f; }
  .save-btn:disabled { opacity:0.4;cursor:not-allowed; }
  .edit-btn { background:transparent;border:1px solid #2a2828;color:#8a8784;font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:0.12em;padding:6px 14px;border-radius:2px;cursor:pointer;transition:all 0.2s; }
  .edit-btn:hover { border-color:#e8621a;color:#e8621a; }
  .danger-btn { background:transparent;border:1px solid rgba(185,28,28,0.3);color:#ef4444;font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:0.12em;padding:6px 14px;border-radius:2px;cursor:pointer;transition:all 0.2s; }
  .danger-btn:hover { background:rgba(185,28,28,0.08);border-color:#b91c1c; }
  .address-card { background:#1a1919;border:1px solid #2a2828;border-radius:2px;padding:14px 16px;margin-bottom:10px;position:relative; }
  .address-card.default { border-color:rgba(232,98,26,0.3); }
  .address-default-badge { font-family:'Share Tech Mono',monospace;font-size:7px;color:#e8621a;letter-spacing:0.15em;border:1px solid rgba(232,98,26,0.25);padding:1px 6px;border-radius:1px;display:inline-block;margin-bottom:6px; }
  .address-name { font-size:14px;font-weight:700;color:#f0ebe3;margin-bottom:3px; }
  .address-text { font-size:13px;color:#8a8784;line-height:1.5; }
  .address-actions { display:flex;gap:8px;margin-top:10px; }
  .quick-links { display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px; }
  .quick-link { background:#1a1919;border:1px solid #2a2828;border-radius:2px;padding:16px;cursor:pointer;transition:all 0.2s;text-decoration:none;display:block; }
  .quick-link:hover { border-color:rgba(232,98,26,0.3);background:#151414; }
  .ql-icon { font-size:20px;margin-bottom:8px;display:block; }
  .ql-title { font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:0.06em;color:#f0ebe3;display:block;margin-bottom:3px; }
  .ql-sub { font-family:'Share Tech Mono',monospace;font-size:8px;color:#8a8784;letter-spacing:0.1em; }
  .signout-row { padding:20px;border-top:1px solid #2a2828;display:flex;justify-content:flex-end; }
  .toast { position:fixed;bottom:24px;right:24px;z-index:200;background:#22c55e;color:#0a0909;font-family:'Bebas Neue',sans-serif;font-size:15px;letter-spacing:0.1em;padding:11px 22px;border-radius:2px;box-shadow:0 8px 32px rgba(0,0,0,0.4);animation:fadeUp 0.25s ease; }
`;

const blankAddress = () => ({
  first_name:"",
  last_name:"",
  address_line1:"",
  address_line2:"",
  city:"",
  state:"",
  zip:"",
  country:"US",
  is_default:false,
});

const TABS = ["PROFILE", "ADDRESSES", "QUICK LINKS"];

export default function AccountClient({ user, initialAddresses }) {
  const [tab,       setTab]       = useState("PROFILE");
  const [editing,   setEditing]   = useState(false);
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName,  setLastName]  = useState(user.lastName);
  const [phone,     setPhone]     = useState(user.phone);
  const [saving,    setSaving]    = useState(false);
  const [addresses, setAddresses] = useState(initialAddresses);
  const [showAddAddr, setShowAddAddr] = useState(false);
  const [newAddr, setNewAddr] = useState({
    first_name:"", last_name:"", address_line1:"",
    address_line2:"", city:"", state:"", zip:"", country:"US",
    is_default:false,
  });
  const [savingAddr, setSavingAddr] = useState(false);
  const [toast,     setToast]     = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };
  const handleSaveAddress = async () => {
    setSavingAddr(true);
    const { data, error } = await supabase
      .from("user_addresses")
      .insert({
        user_id:    user.id,
        first_name: newAddr.first_name,
        last_name:  newAddr.last_name,
        address1:   newAddr.address_line1,
        address2:   newAddr.address_line2,
        city:       newAddr.city,
        state:      newAddr.state,
        zip:        newAddr.zip,
        country:    newAddr.country || "US",
        is_default: newAddr.is_default,
      })
      .select()
      .single();
    setSavingAddr(false);
    if (error) { showToast(error.message); return; }
    setAddresses(prev => [data, ...prev]);
    setShowAddAddr(false);
    setNewAddr(blankAddress());
    showToast("Address saved");
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("user_profiles")
      .update({ first_name: firstName, last_name: lastName, phone })
      .eq("id", user.id);
    setSaving(false);
    if (!error) { setEditing(false); showToast("Profile updated"); }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const memberYear = new Date(user.memberSince).getFullYear();

  const B = s => ({ fontFamily:"'Bebas Neue',sans-serif",     ...s });
  const M = s => ({ fontFamily:"'Share Tech Mono',monospace", ...s });

  return (
    <div className="acc-wrap">
      <style>{css}</style>

      <NavBar activePage="account" />

      {/* HEADER */}
      <div className="acc-header">
        <div className="acc-header-inner">
          <div>
            <div style={M({fontSize:9, color:"#e8621a", letterSpacing:"0.25em", marginBottom:6})}>MY ACCOUNT</div>
            <div style={B({fontSize:38, letterSpacing:"0.04em", lineHeight:1})}>
              {user.firstName || user.email.split("@")[0].toUpperCase()}
            </div>
            <div style={{fontSize:13, color:"#8a8784", marginTop:4}}>{user.email} · Member since {memberYear}</div>
          </div>
          <div style={{display:"flex", gap:10}}>
            <a href="/account/points" style={{...M({fontSize:9, letterSpacing:"0.12em"}), background:"rgba(201,168,76,0.08)", border:"1px solid rgba(201,168,76,0.2)", color:"#c9a84c", padding:"8px 14px", borderRadius:2, textDecoration:"none"}}>
              ★ {user.points.toLocaleString()} POINTS
            </a>
            <a href="/garage" style={{...M({fontSize:9, letterSpacing:"0.12em"}), background:"#111010", border:"1px solid #2a2828", color:"#8a8784", padding:"8px 14px", borderRadius:2, textDecoration:"none"}}>
              MY GARAGE →
            </a>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="acc-tabs">
        {TABS.map(t => (
          <button key={t} className={`acc-tab ${tab===t?"active":""}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <div className="acc-body">

        {/* ── PROFILE TAB ── */}
        {tab === "PROFILE" && (
          <>
            <div className="acc-section">
              <div className="acc-section-head">
                <div className="acc-section-title">PERSONAL <span>INFO</span></div>
                {!editing
                  ? <button className="edit-btn" onClick={() => setEditing(true)}>EDIT</button>
                  : <div style={{display:"flex", gap:8}}>
                      <button className="edit-btn" onClick={() => setEditing(false)}>CANCEL</button>
                      <button className="save-btn" onClick={handleSaveProfile} disabled={saving}>
                        {saving ? "SAVING..." : "SAVE"}
                      </button>
                    </div>
                }
              </div>
              <div className="acc-section-body">
                <div className="field-grid">
                  <div>
                    <label className="field-label">FIRST NAME</label>
                    {editing
                      ? <input className="field-input" value={firstName} onChange={e=>setFirstName(e.target.value)}/>
                      : <div className="field-value">{firstName || "—"}</div>
                    }
                  </div>
                  <div>
                    <label className="field-label">LAST NAME</label>
                    {editing
                      ? <input className="field-input" value={lastName} onChange={e=>setLastName(e.target.value)}/>
                      : <div className="field-value">{lastName || "—"}</div>
                    }
                  </div>
                  <div>
                    <label className="field-label">EMAIL ADDRESS</label>
                    <div className="field-value">{user.email}</div>
                  </div>
                  <div>
                    <label className="field-label">PHONE</label>
                    {editing
                      ? <input className="field-input" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="555-555-5555"/>
                      : <div className="field-value">{phone || "—"}</div>
                    }
                  </div>
                </div>
              </div>
            </div>

            <div className="acc-section">
              <div className="acc-section-head">
                <div className="acc-section-title">ACCOUNT <span>SECURITY</span></div>
              </div>
              <div className="acc-section-body">
                <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12}}>
                  <div>
                    <div style={{fontSize:14, fontWeight:600, color:"#f0ebe3", marginBottom:3}}>Password</div>
                    <div style={M({fontSize:9, color:"#8a8784", letterSpacing:"0.1em"})}>LAST CHANGED: UNKNOWN</div>
                  </div>
                  <button className="edit-btn" onClick={async () => {
                    await supabase.auth.signInWithOtp({ email: user.email, options: { emailRedirectTo: `${window.location.origin}/account` }});
                    showToast("Magic link sent to " + user.email);
                  }}>
                    SEND RESET LINK
                  </button>
                </div>
              </div>
            </div>

            <div className="signout-row">
              <button className="danger-btn" onClick={handleSignOut}>SIGN OUT</button>
            </div>
          </>
        )}

        {/* ── ADDRESSES TAB ── */}
        {tab === "ADDRESSES" && (
          <div className="acc-section">
              <div className="acc-section-head">
                <div className="acc-section-title">SAVED <span>ADDRESSES</span></div>
                    <button
                      className="edit-btn"
                      onClick={() => {
                        setNewAddr(blankAddress());
                        setShowAddAddr(true);
                      }}
                    >
                  + ADD ADDRESS
                </button>
              </div>
            <div className="acc-section-body">
              {addresses.length === 0 ? (
                <div style={{padding:"32px 0", textAlign:"center"}}>
                  <div style={B({fontSize:22, letterSpacing:"0.05em", color:"#3a3838", marginBottom:6})}>NO ADDRESSES SAVED</div>
                  <div style={M({fontSize:9, color:"#8a8784", letterSpacing:"0.12em"})}>ADD AN ADDRESS TO SPEED UP CHECKOUT</div>
                </div>
              ) : (
                addresses.map((addr, i) => (
                  <div key={addr.id} className={`address-card ${addr.is_default?"default":""}`}>
                    {addr.is_default && <div className="address-default-badge">★ DEFAULT</div>}
                    <div className="address-name">{addr.first_name} {addr.last_name}</div>
                    <div className="address-text">
                      {addr.address1}{addr.address2 ? `, ${addr.address2}` : ""}<br/>
                      {addr.city}, {addr.state} {addr.zip}<br/>
                      {addr.country}
                    </div>
                    <div className="address-actions">
                      <button className="edit-btn">EDIT</button>
                      {!addr.is_default && <button className="edit-btn">SET DEFAULT</button>}
                      <button className="danger-btn">REMOVE</button>
                    </div>
                  </div>
                ))
              )}
              {showAddAddr && (
                <div style={{
                  position:"fixed", inset:0, zIndex:300,
                  background:"rgba(0,0,0,0.75)", backdropFilter:"blur(4px)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  padding:"32px 20px",
                  overflowY:"auto",
                }}>
                  <div style={{
                    background:"#111010", border:"1px solid #2a2828",
                    borderRadius:6, padding:32, width:"min(100%,760px)",
                    maxWidth:760, minHeight:960, maxHeight:"calc(100vh - 80px)",
                    position:"relative",
                    marginTop:"auto",
                    marginBottom:"auto",
                    overflowY:"auto",
                  }}>
                    {/* Header */}
                    <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20}}>
                      <div style={{fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:"0.05em"}}>
                        ADD <span style={{color:"#e8621a"}}>ADDRESS</span>
                      </div>
                      <button onClick={() => setShowAddAddr(false)} style={{background:"none", border:"none", color:"#8a8784", fontSize:18, cursor:"pointer"}}>✕</button>
                    </div>

                    {/* Name row */}
                    <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12}}>
                      <div>
                        <label className="field-label">FIRST NAME</label>
                        <input className="field-input" value={newAddr.first_name}
                          onChange={e => setNewAddr(a => ({...a, first_name: e.target.value}))}
                          placeholder="John"/>
                      </div>
                      <div>
                        <label className="field-label">LAST NAME</label>
                        <input className="field-input" value={newAddr.last_name}
                          onChange={e => setNewAddr(a => ({...a, last_name: e.target.value}))}
                          placeholder="Doe"/>
                      </div>
                    </div>

                    {/* Autocomplete street */}
                    <div style={{marginBottom:12}}>
                      <label className="field-label">STREET ADDRESS</label>
                      <AddressAutocomplete
                        placeholder="Start typing your address..."
                        onSelect={(parsed) => setNewAddr(a => ({
                          ...a,
                          address_line1: parsed.address_line1,
                          city:          parsed.city,
                          state:         parsed.state,
                          zip:           parsed.zip,
                          country:       parsed.country || "US",
                        }))}
                      />
                    </div>

                    {/* Apt / Suite */}
                    <div style={{marginBottom:12}}>
                      <label className="field-label">APT / SUITE (OPTIONAL)</label>
                      <input className="field-input" value={newAddr.address_line2}
                        onChange={e => setNewAddr(a => ({...a, address_line2: e.target.value}))}
                        placeholder="Apt 4B"/>
                    </div>

                    {/* City / State / Zip */}
                    <div style={{display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:12, marginBottom:12}}>
                      <div>
                        <label className="field-label">CITY</label>
                        <input className="field-input" value={newAddr.city}
                          onChange={e => setNewAddr(a => ({...a, city: e.target.value}))}
                          placeholder="Palm Coast"/>
                      </div>
                      <div>
                        <label className="field-label">STATE</label>
                        <input className="field-input" value={newAddr.state}
                          onChange={e => setNewAddr(a => ({...a, state: e.target.value}))}
                          placeholder="FL" maxLength={2}/>
                      </div>
                      <div>
                        <label className="field-label">ZIP</label>
                        <input className="field-input" value={newAddr.zip}
                          onChange={e => setNewAddr(a => ({...a, zip: e.target.value}))}
                          placeholder="32137"/>
                      </div>
                    </div>

                    {/* Default toggle */}
                    <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 0", borderTop:"1px solid #1a1919", marginBottom:16}}>
                      <span style={{fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#8a8784", letterSpacing:"0.12em"}}>SET AS DEFAULT ADDRESS</span>
                      <div
                        onClick={() => setNewAddr(a => ({...a, is_default: !a.is_default}))}
                        style={{width:32, height:18, borderRadius:9, background: newAddr.is_default?"#e8621a":"#2a2828", position:"relative", cursor:"pointer", transition:"background 0.2s"}}
                      >
                        <div style={{position:"absolute", top:2, left: newAddr.is_default?14:2, width:14, height:14, borderRadius:"50%", background:"#f0ebe3", transition:"left 0.2s"}}/>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{display:"flex", gap:10}}>
                      <button onClick={() => setShowAddAddr(false)} style={{flex:1, background:"transparent", border:"1px solid #2a2828", color:"#8a8784", fontFamily:"'Bebas Neue',sans-serif", fontSize:16, letterSpacing:"0.1em", padding:"10px", borderRadius:2, cursor:"pointer"}}>
                        CANCEL
                      </button>
                      <button
                        onClick={handleSaveAddress}
                        disabled={savingAddr || !newAddr.address_line1 || !newAddr.city}
                        style={{flex:2, background:"#e8621a", border:"none", color:"#0a0909", fontFamily:"'Bebas Neue',sans-serif", fontSize:16, letterSpacing:"0.1em", padding:"10px", borderRadius:2, cursor:"pointer", opacity: savingAddr?"0.5":1}}
                      >
                        {savingAddr ? "SAVING..." : "SAVE ADDRESS"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── QUICK LINKS TAB ── */}
        {tab === "QUICK LINKS" && (
          <div className="acc-section">
            <div className="acc-section-head">
              <div className="acc-section-title">QUICK <span>ACCESS</span></div>
            </div>
            <div className="acc-section-body">
              <div className="quick-links">
                {[
                  { href:"/garage",           icon:"🏍",  title:"My Garage",       sub:"Manage your vehicles"      },
                  { href:"/account/orders",   icon:"📦",  title:"Order History",   sub:"Track & view past orders"  },
                  { href:"/account/points",   icon:"★",   title:"Points & Rewards",sub:`${user.points.toLocaleString()} pts available` },
                  { href:"/account/wishlist", icon:"♡",   title:"Wishlist",        sub:"Saved parts & alerts"      },
                  { href:"/shop",             icon:"🔧",  title:"Shop Parts",      sub:"500K+ parts available"     },
                  { href:"/search",           icon:"🔍",  title:"Search",          sub:"Find any part fast"        },
                ].map(l => (
                  <a key={l.href} href={l.href} className="quick-link">
                    <span className="ql-icon">{l.icon}</span>
                    <span className="ql-title">{l.title}</span>
                    <span className="ql-sub">{l.sub}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>

      {toast && <div className="toast">✓ {toast.toUpperCase()}</div>}
    </div>
  );
}
