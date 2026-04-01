"use client";
// app/account/points/PointsClient.jsx

const POINTS_TO_DOLLAR = 0.01; // 100 pts = $1
const POINTS_PER_DOLLAR = 10;  // earn 10 pts per $1 spent
const EXPIRY_DAYS = 365;

import NavBar from "@/components/NavBar";

const css = `
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  ::-webkit-scrollbar { width:4px; } ::-webkit-scrollbar-thumb { background:#e8621a; }
  @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes fillBar { from{width:0} to{width:var(--w)} }
  .pts-wrap { background:#0a0909; min-height:100vh; color:#f0ebe3; font-family:var(--font-stencil),sans-serif; }
  .pts-hero { background:#111010;border-bottom:1px solid #2a2828;padding:32px 24px; }
  .pts-hero-inner { max-width:900px;margin:0 auto; }
  .pts-balance-row { display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-top:24px; }
  .pts-stat { background:#0a0909;border:1px solid #2a2828;border-radius:3px;padding:16px 20px; }
  .pts-stat.gold { border-color:rgba(201,168,76,0.25);background:rgba(201,168,76,0.04); }
  .pts-stat-val { font-family:var(--font-caesar),sans-serif;font-size:36px;color:#f0ebe3;letter-spacing:0.04em;line-height:1;margin-bottom:4px; }
  .pts-stat.gold .pts-stat-val { color:#c9a84c; }
  .pts-stat-label { font-family:var(--font-stencil),monospace;font-size:8px;color:#8a8784;letter-spacing:0.15em; }
  .pts-body { max-width:900px;margin:0 auto;padding:28px 24px; }
  .pts-section { background:#111010;border:1px solid #2a2828;border-radius:3px;margin-bottom:16px;overflow:hidden;animation:fadeUp 0.25s ease both; }
  .pts-section-head { padding:16px 20px;border-bottom:1px solid #2a2828; }
  .pts-section-title { font-family:var(--font-caesar),sans-serif;font-size:20px;letter-spacing:0.05em; }
  .pts-section-title span { color:#e8621a; }
  .pts-section-body { padding:20px; }
  .pts-how-grid { display:grid;grid-template-columns:1fr 1fr;gap:10px; }
  .pts-how-card { background:#1a1919;border:1px solid #2a2828;border-radius:2px;padding:14px 16px; }
  .pts-how-rate { font-family:var(--font-caesar),sans-serif;font-size:28px;color:#e8621a;letter-spacing:0.04em;line-height:1;margin-bottom:4px; }
  .pts-how-desc { font-size:13px;font-weight:500;color:#8a8784;line-height:1.4; }
  .tier-bar-wrap { margin-top:4px; }
  .tier-bar-track { height:6px;background:#2a2828;border-radius:3px;overflow:hidden;margin:10px 0 6px; }
  .tier-bar-fill { height:100%;background:linear-gradient(90deg,#e8621a,#c9a84c);border-radius:3px;animation:fillBar 1s ease forwards;transition:width 0.5s; }
  .tier-labels { display:flex;justify-content:space-between;font-family:var(--font-stencil),monospace;font-size:8px;color:#8a8784;letter-spacing:0.1em; }
  .ledger-table { width:100%;border-collapse:collapse; }
  .ledger-table th { font-family:var(--font-stencil),monospace;font-size:8px;color:#8a8784;letter-spacing:0.15em;padding:8px 12px;text-align:left;border-bottom:1px solid #2a2828; }
  .ledger-table td { padding:12px;border-bottom:1px solid #1a1919;font-size:13px;font-weight:500; }
  .ledger-table tr:last-child td { border-bottom:none; }
  .pts-type-earn { color:#22c55e; }
  .pts-type-redeem { color:#e8621a; }
  .pts-type-expire { color:#8a8784; }
  .pts-type-adjust { color:#c9a84c; }
  .ledger-empty { padding:40px;text-align:center;font-family:var(--font-stencil),monospace;font-size:9px;color:#8a8784;letter-spacing:0.12em; }
  .redeem-info { background:rgba(232,98,26,0.06);border:1px solid rgba(232,98,26,0.15);border-radius:2px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap; }
  .redeem-info-text { font-size:14px;font-weight:500;color:#f0ebe3;line-height:1.4; }
  .redeem-info-text span { color:#e8621a; }
  .redeem-note { font-family:var(--font-stencil),monospace;font-size:8px;color:#8a8784;letter-spacing:0.1em;margin-top:4px;display:block; }
  .shop-btn { background:#e8621a;border:none;color:#0a0909;font-family:var(--font-caesar),sans-serif;font-size:16px;letter-spacing:0.1em;padding:10px 20px;border-radius:2px;cursor:pointer;white-space:nowrap; }
`;

const TIER_THRESHOLDS = [
  { name:"RIDER",    min:0,     max:500,   color:"#8a8784" },
  { name:"THROTTLE", min:500,   max:2000,  color:"#e8621a" },
  { name:"IRON",     min:2000,  max:5000,  color:"#c9a84c" },
  { name:"LEGEND",   min:5000,  max:99999, color:"#f0ebe3" },
];

function getTier(points) {
  return TIER_THRESHOLDS.findLast(t => points >= t.min) ?? TIER_THRESHOLDS[0];
}

function getLedgerColor(type) {
  if (!type) return "";
  if (type.includes("earn") || type.includes("award") || type.includes("birthday")) return "pts-type-earn";
  if (type.includes("redeem")) return "pts-type-redeem";
  if (type.includes("expire")) return "pts-type-expire";
  return "pts-type-adjust";
}

export default function PointsClient({ user, points, lifetimeSpend, orderCount, ledger }) {
  const dollarValue = (points * POINTS_TO_DOLLAR).toFixed(2);
  const tier        = getTier(points);
  const nextTier    = TIER_THRESHOLDS[TIER_THRESHOLDS.indexOf(tier) + 1];
  const tierPct     = nextTier
    ? Math.min(100, ((points - tier.min) / (nextTier.min - tier.min)) * 100)
    : 100;

  const B = s => ({ fontFamily:"var(--font-caesar),sans-serif",     ...s });
  const M = s => ({ fontFamily:"var(--font-stencil),monospace", ...s });

  return (
    <div className="pts-wrap">
      <style>{css}</style>

      <NavBar activePage="account" />

      {/* HERO */}
      <div className="pts-hero">
        <div className="pts-hero-inner">
          <div style={M({fontSize:9, color:"#e8621a", letterSpacing:"0.25em", marginBottom:6})}>LOYALTY PROGRAM</div>
          <div style={B({fontSize:42, letterSpacing:"0.04em", lineHeight:1})}>
            POINTS & <span style={{color:"#e8621a"}}>REWARDS</span>
          </div>
          <div className="pts-balance-row">
            <div className="pts-stat gold">
              <div className="pts-stat-val">{points.toLocaleString()}</div>
              <div className="pts-stat-label">POINTS BALANCE</div>
            </div>
            <div className="pts-stat">
              <div className="pts-stat-val">${dollarValue}</div>
              <div className="pts-stat-label">CASH VALUE</div>
            </div>
            <div className="pts-stat">
              <div className="pts-stat-val">{orderCount}</div>
              <div className="pts-stat-label">TOTAL ORDERS</div>
            </div>
            <div className="pts-stat">
              <div className="pts-stat-val">${Number(lifetimeSpend).toFixed(0)}</div>
              <div className="pts-stat-label">LIFETIME SPEND</div>
            </div>
          </div>
        </div>
      </div>

      <div className="pts-body">

        {/* Tier status */}
        <div className="pts-section">
          <div className="pts-section-head">
            <div className="pts-section-title">YOUR <span>TIER</span></div>
          </div>
          <div className="pts-section-body">
            <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12}}>
              <div>
                <div style={{...B({fontSize:32, letterSpacing:"0.06em", lineHeight:1}), color:tier.color}}>{tier.name}</div>
                <div style={M({fontSize:9, color:"#8a8784", letterSpacing:"0.12em", marginTop:4})}>CURRENT STATUS</div>
              </div>
              {nextTier && (
                <div style={{textAlign:"right"}}>
                  <div style={M({fontSize:9, color:"#8a8784", letterSpacing:"0.12em", marginBottom:3})}>NEXT TIER</div>
                  <div style={B({fontSize:20, letterSpacing:"0.06em", color:"#f0ebe3"})}>{nextTier.name}</div>
                  <div style={M({fontSize:8, color:"#8a8784", letterSpacing:"0.1em"})}>{(nextTier.min - points).toLocaleString()} PTS AWAY</div>
                </div>
              )}
            </div>
            <div className="tier-bar-wrap">
              <div className="tier-bar-track">
                <div className="tier-bar-fill" style={{"--w":`${tierPct}%`, width:`${tierPct}%`}}/>
              </div>
              <div className="tier-labels">
                <span>{tier.name} ({tier.min.toLocaleString()})</span>
                {nextTier && <span>{nextTier.name} ({nextTier.min.toLocaleString()})</span>}
              </div>
            </div>
          </div>
        </div>

        {/* How to earn */}
        <div className="pts-section">
          <div className="pts-section-head">
            <div className="pts-section-title">HOW TO <span>EARN</span></div>
          </div>
          <div className="pts-section-body">
            <div className="pts-how-grid">
              {[
                ["10× PTS",  "Earn 10 points for every $1 spent on parts"],
                ["2× PTS",   "Double points on your birthday month"],
                ["500 PTS",  "Refer a friend who makes their first purchase"],
                ["100 PTS",  "Leave a verified product review"],
              ].map(([rate, desc]) => (
                <div key={rate} className="pts-how-card">
                  <div className="pts-how-rate">{rate}</div>
                  <div className="pts-how-desc">{desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Redeem */}
        <div className="pts-section">
          <div className="pts-section-head">
            <div className="pts-section-title">REDEEM <span>POINTS</span></div>
          </div>
          <div className="pts-section-body">
            <div className="redeem-info">
              <div>
                <div className="redeem-info-text">
                  Your <span>{points.toLocaleString()} points</span> are worth <span>${dollarValue}</span> off your next order.
                </div>
                <span className="redeem-note">POINTS ARE APPLIED AT CHECKOUT · MAP PRICING IS ALWAYS ENFORCED</span>
              </div>
              <button className="shop-btn" onClick={() => window.location.href = "/shop"}>
                SHOP NOW →
              </button>
            </div>
          </div>
        </div>

        {/* Ledger */}
        <div className="pts-section">
          <div className="pts-section-head">
            <div className="pts-section-title">POINTS <span>HISTORY</span></div>
          </div>
          {ledger.length === 0 ? (
            <div className="ledger-empty">NO POINTS ACTIVITY YET — MAKE YOUR FIRST PURCHASE TO START EARNING</div>
          ) : (
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>DATE</th>
                  <th>DESCRIPTION</th>
                  <th>TYPE</th>
                  <th style={{textAlign:"right"}}>POINTS</th>
                  <th>EXPIRES</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map(row => (
                  <tr key={row.id}>
                    <td style={{fontFamily:"var(--font-stencil),monospace", fontSize:10, color:"#8a8784"}}>
                      {new Date(row.created_at).toLocaleDateString("en-US", {month:"short", day:"numeric", year:"numeric"})}
                    </td>
                    <td style={{color:"#f0ebe3"}}>{row.description ?? "—"}</td>
                    <td>
                      <span className={getLedgerColor(row.type)} style={{fontFamily:"var(--font-stencil),monospace", fontSize:9, letterSpacing:"0.1em"}}>
                        {row.type?.toUpperCase() ?? "—"}
                      </span>
                    </td>
                    <td style={{textAlign:"right", fontFamily:"var(--font-caesar),sans-serif", fontSize:18, letterSpacing:"0.04em"}}>
                      <span className={row.points > 0 ? "pts-type-earn" : "pts-type-redeem"}>
                        {row.points > 0 ? "+" : ""}{row.points.toLocaleString()}
                      </span>
                    </td>
                    <td style={{fontFamily:"var(--font-stencil),monospace", fontSize:9, color:"#8a8784"}}>
                      {row.expires_at ? new Date(row.expires_at).toLocaleDateString("en-US", {month:"short", year:"numeric"}) : "NEVER"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  );
}
