"use client";
// ============================================================
// app/admin/sync/page.jsx
// ============================================================
// Vendor sync dashboard — Parts Unlimited + WPS tabs.
// Same visual style as original, extended with tab navigation.
// ============================================================

import { useState, useEffect, useCallback } from "react";
import NavBar from "@/components/NavBar";

const css = `
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  ::-webkit-scrollbar { width:4px; } ::-webkit-scrollbar-thumb { background:#e8621a; }
  @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes spin { to { transform:rotate(360deg); } }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  .sync-wrap { background:#0a0909; min-height:100vh; color:#f0ebe3; font-family:'Barlow Condensed',sans-serif; }
  .sync-header { background:#111010;border-bottom:1px solid #2a2828;padding:28px 24px; }
  .sync-body { max-width:960px;margin:0 auto;padding:28px 24px; }
  .card { background:#111010;border:1px solid #2a2828;border-radius:3px;margin-bottom:16px;overflow:hidden;animation:fadeUp 0.25s ease both; }
  .card-head { padding:14px 20px;border-bottom:1px solid #2a2828;display:flex;align-items:center;justify-content:space-between;gap:12px; }
  .card-title { font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:0.05em; }
  .card-title span { color:#e8621a; }
  .card-body { padding:20px; }
  .stat-grid { display:grid;grid-template-columns:repeat(4,1fr);gap:10px; }
  .stat-box { background:#0a0909;border:1px solid #2a2828;border-radius:2px;padding:14px 16px; }
  .stat-box.highlight { border-color:rgba(232,98,26,0.3);background:rgba(232,98,26,0.04); }
  .stat-box.green { border-color:rgba(34,197,94,0.25);background:rgba(34,197,94,0.04); }
  .stat-box.red { border-color:rgba(185,28,28,0.25);background:rgba(185,28,28,0.04); }
  .stat-val { font-family:'Bebas Neue',sans-serif;font-size:30px;letter-spacing:0.04em;line-height:1;margin-bottom:4px; }
  .stat-label { font-family:'Share Tech Mono',monospace;font-size:8px;color:#8a8784;letter-spacing:0.12em; }

  /* Tabs */
  .tabs { display:flex;gap:0;border-bottom:1px solid #2a2828;margin-bottom:24px; }
  .tab { font-family:'Bebas Neue',sans-serif;font-size:17px;letter-spacing:0.08em;padding:12px 24px;cursor:pointer;border-bottom:2px solid transparent;color:#8a8784;transition:all 0.15s;background:none;border-top:none;border-left:none;border-right:none; }
  .tab:hover { color:#f0ebe3; }
  .tab.active { color:#e8621a;border-bottom-color:#e8621a; }
  .tab-badge { display:inline-block;background:#2a2828;color:#8a8784;font-family:'Share Tech Mono',monospace;font-size:8px;padding:2px 6px;border-radius:1px;margin-left:8px;vertical-align:middle; }
  .tab.active .tab-badge { background:rgba(232,98,26,0.12);color:#e8621a; }

  /* Cooldown bar */
  .cooldown-wrap { margin-bottom:20px; }
  .cooldown-bar-labels { display:flex;justify-content:space-between;font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:0.1em;margin-bottom:6px; }
  .cooldown-bar-track { height:6px;background:#2a2828;border-radius:3px;overflow:hidden; }
  .cooldown-bar-fill { height:100%;border-radius:3px;transition:width 0.5s ease; }

  /* Sync button */
  .sync-btn { background:#e8621a;border:none;color:#0a0909;font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:0.1em;padding:12px 32px;border-radius:2px;cursor:pointer;transition:all 0.2s;white-space:nowrap; }
  .sync-btn:hover:not(:disabled) { background:#c94f0f; transform:translateY(-1px); }
  .sync-btn:disabled { opacity:0.35;cursor:not-allowed;transform:none; }
  .sync-btn.blocked { background:#2a2828;color:#8a8784; }
  .force-btn { background:transparent;border:1px solid rgba(185,28,28,0.35);color:#ef4444;font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:0.12em;padding:7px 14px;border-radius:2px;cursor:pointer;transition:all 0.2s; }
  .force-btn:hover { background:rgba(185,28,28,0.08); }
  .spinner { width:14px;height:14px;border-radius:50%;border:2px solid rgba(10,9,9,0.3);border-top-color:#0a0909;animation:spin 0.7s linear infinite;display:inline-block;vertical-align:middle;margin-right:8px; }

  /* Log table */
  .log-table { width:100%;border-collapse:collapse; }
  .log-table th { font-family:'Share Tech Mono',monospace;font-size:8px;color:#8a8784;letter-spacing:0.12em;padding:8px 12px;text-align:left;border-bottom:1px solid #2a2828; }
  .log-table td { padding:10px 12px;border-bottom:1px solid #1a1919;font-size:13px;font-weight:500; }
  .log-table tr:last-child td { border-bottom:none; }
  .badge { font-family:'Share Tech Mono',monospace;font-size:8px;letter-spacing:0.1em;padding:2px 8px;border-radius:1px; }
  .badge-success { background:rgba(34,197,94,0.1);color:#22c55e;border:1px solid rgba(34,197,94,0.2); }
  .badge-error { background:rgba(185,28,28,0.1);color:#ef4444;border:1px solid rgba(185,28,28,0.2); }

  /* Live log */
  .live-log { background:#0a0909;border:1px solid #2a2828;border-radius:2px;padding:14px;font-family:'Share Tech Mono',monospace;font-size:10px;color:#8a8784;letter-spacing:0.06em;line-height:1.8;max-height:240px;overflow-y:auto; }
  .live-log .log-success { color:#22c55e; }
  .live-log .log-error { color:#ef4444; }
  .live-log .log-warn { color:#c9a84c; }

  /* Warning banner */
  .warn-banner { background:rgba(201,168,76,0.06);border:1px solid rgba(201,168,76,0.2);border-radius:2px;padding:12px 16px;display:flex;gap:10px;align-items:flex-start; }

  /* Info banner */
  .info-banner { background:rgba(59,130,246,0.05);border:1px solid rgba(59,130,246,0.15);border-radius:2px;padding:12px 16px;display:flex;gap:10px;align-items:flex-start; }

  @media (max-width:700px) {
    .stat-grid { grid-template-columns:1fr 1fr; }
    .tabs { overflow-x:auto; }
  }
`;

const SYNC_SECRET = process.env.NEXT_PUBLIC_SYNC_SECRET ?? "";
const PU_COOLDOWN = 10;

// ── Helper styles ─────────────────────────────────────────────
const B = (s) => ({ fontFamily: "'Bebas Neue',sans-serif", ...s });
const M = (s) => ({ fontFamily: "'Share Tech Mono',monospace", ...s });

// ============================================================
// PU PANEL — unchanged from original
// ============================================================

function PuPanel() {
  const [status,     setStatus]     = useState("idle");
  const [syncResult, setSyncResult] = useState(null);
  const [dbStatus,   setDbStatus]   = useState(null);
  const [logs,       setLogs]       = useState([]);
  const [showForce,  setShowForce]  = useState(false);

  const addLog = (msg, type = "info") =>
    setLogs(prev => [{ msg, type, ts: new Date().toLocaleTimeString() }, ...prev]);

  const fetchStatus = useCallback(async () => {
    try {
      const res  = await fetch("/api/vendors/parts-unlimited/sync", {
        headers: { Authorization: `Bearer ${SYNC_SECRET}` },
      });
      const data = await res.json();
      setDbStatus(data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchStatus();
    const iv = setInterval(fetchStatus, 30_000);
    return () => clearInterval(iv);
  }, [fetchStatus]);

  const runSync = async (force = false) => {
    setStatus("running");
    setSyncResult(null);
    setLogs([]);
    setShowForce(false);
    addLog("Connecting to Parts Unlimited API...", "info");

    const headers = {
      "Content-Type": "application/json",
      Authorization:  `Bearer ${SYNC_SECRET}`,
    };
    if (force) {
      headers["x-force-sync"] = "true";
      addLog("⚠ Force override active — cooldown bypassed!", "warn");
    }

    try {
      const res  = await fetch("/api/vendors/parts-unlimited/sync", { method: "POST", headers });
      const data = await res.json();

      if (res.status === 429) {
        addLog(`Blocked: ${data.error}`, "error");
        addLog(`Next allowed: ${new Date(data.next_allowed_at).toLocaleString()}`, "warn");
        addLog(`Hours remaining: ${data.hours_remaining}h`, "warn");
        setStatus("error");
        return;
      }

      if (!res.ok || !data.success) {
        addLog(`Sync failed: ${data.error ?? "Unknown error"}`, "error");
        setStatus("error");
        return;
      }

      const s = data.summary;
      setSyncResult(s);
      addLog(`✓ Sync complete in ${(s.durationMs / 1000).toFixed(1)}s`, "success");
      addLog(`${s.upserted.toLocaleString()} parts upserted to Supabase`, "success");
      addLog(`${s.discontinued.toLocaleString()} discontinued parts marked inactive`, "info");
      addLog(`${s.skipped.toLocaleString()} parts skipped (filtered categories)`, "info");
      if (s.errors > 0) addLog(`${s.errors} batch errors — check server logs`, "error");
      setStatus("done");
      fetchStatus();
    } catch (err) {
      addLog(`Fatal: ${err?.message ?? "Network error"}`, "error");
      setStatus("error");
    }
  };

  const hoursRemaining = dbStatus?.hoursSinceLastSync !== null
    ? Math.max(0, (dbStatus?.cooldownHours ?? PU_COOLDOWN) - (dbStatus?.hoursSinceLastSync ?? 0))
    : 0;
  const cooldownPct = dbStatus?.hoursSinceLastSync !== null
    ? Math.min(100, ((dbStatus?.hoursSinceLastSync ?? 0) / (dbStatus?.cooldownHours ?? PU_COOLDOWN)) * 100)
    : 100;
  const canSync  = dbStatus?.canSyncNow ?? true;
  const isRunning = status === "running";

  return (
    <>
      {/* Pull budget */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">PULL <span>BUDGET</span></div>
          <span style={M({fontSize:9, color: canSync ? "#22c55e" : "#c9a84c", letterSpacing:"0.12em"})}>
            {canSync ? "✓ READY TO SYNC" : `⏳ ${hoursRemaining.toFixed(1)}H REMAINING`}
          </span>
        </div>
        <div className="card-body">
          <div className="cooldown-wrap">
            <div className="cooldown-bar-labels">
              <span style={{color: canSync ? "#22c55e" : "#c9a84c"}}>
                {canSync ? "COOLDOWN EXPIRED — READY" : `COOLDOWN ACTIVE — ${hoursRemaining.toFixed(1)}H LEFT`}
              </span>
              <span style={{color:"#8a8784"}}>{dbStatus?.cooldownHours ?? PU_COOLDOWN}H WINDOW</span>
            </div>
            <div className="cooldown-bar-track">
              <div
                className="cooldown-bar-fill"
                style={{
                  width: `${cooldownPct}%`,
                  background: canSync
                    ? "linear-gradient(90deg,#22c55e,#16a34a)"
                    : "linear-gradient(90deg,#e8621a,#c9a84c)",
                }}
              />
            </div>
          </div>
          <div className="stat-grid">
            <div className={`stat-box ${canSync ? "green" : ""}`}>
              <div className="stat-val" style={{color: canSync ? "#22c55e" : "#c9a84c"}}>
                {canSync ? "YES" : "NO"}
              </div>
              <div className="stat-label">CAN SYNC NOW</div>
            </div>
            <div className="stat-box">
              <div className="stat-val">2</div>
              <div className="stat-label">PULLS PER DAY</div>
            </div>
            <div className="stat-box">
              <div className="stat-val">
                {dbStatus?.hoursSinceLastSync != null ? `${dbStatus.hoursSinceLastSync}H` : "—"}
              </div>
              <div className="stat-label">SINCE LAST SYNC</div>
            </div>
            <div className="stat-box highlight">
              <div className="stat-val" style={{color:"#e8621a"}}>
                {dbStatus?.totalActiveProducts?.toLocaleString() ?? "—"}
              </div>
              <div className="stat-label">ACTIVE PRODUCTS</div>
            </div>
          </div>
        </div>
      </div>

      {/* Trigger */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">TRIGGER <span>SYNC</span></div>
        </div>
        <div className="card-body">
          {!canSync && !isRunning && (
            <div className="warn-banner" style={{marginBottom:16}}>
              <span style={{fontSize:16}}>⏳</span>
              <div>
                <div style={M({fontSize:9, color:"#c9a84c", letterSpacing:"0.12em", marginBottom:4})}>
                  COOLDOWN ACTIVE
                </div>
                <div style={{fontSize:13, color:"#c2b9b0"}}>
                  Last sync completed {dbStatus?.hoursSinceLastSync}h ago. Next sync allowed at{" "}
                  <strong style={{color:"#f0ebe3"}}>
                    {dbStatus?.nextAllowedAt ? new Date(dbStatus.nextAllowedAt).toLocaleString() : "—"}
                  </strong>
                </div>
              </div>
            </div>
          )}

          <div style={{display:"flex", alignItems:"center", gap:12, flexWrap:"wrap"}}>
            <button
              className={`sync-btn ${!canSync && !isRunning ? "blocked" : ""}`}
              onClick={() => canSync && !isRunning && runSync(false)}
              disabled={isRunning || !canSync}
            >
              {isRunning
                ? <><span className="spinner"/>SYNCING...</>
                : !canSync
                  ? `COOLDOWN — ${hoursRemaining.toFixed(1)}H LEFT`
                  : status === "done" ? "SYNC AGAIN" : "START SYNC →"}
            </button>
            {status === "done" && (
              <span style={M({fontSize:9, color:"#22c55e", letterSpacing:"0.12em"})}>✓ SYNC COMPLETE</span>
            )}
            {status === "error" && (
              <span style={M({fontSize:9, color:"#ef4444", letterSpacing:"0.12em"})}>✗ SYNC FAILED — SEE LOGS BELOW</span>
            )}
            {isRunning && (
              <span style={M({fontSize:9, color:"#e8621a", letterSpacing:"0.12em", animation:"pulse 1.5s infinite"})}>
                DO NOT CLOSE THIS PAGE
              </span>
            )}
          </div>

          {!canSync && !isRunning && (
            <div style={{marginTop:16, paddingTop:16, borderTop:"1px solid #1a1919"}}>
              {!showForce ? (
                <button
                  style={M({fontSize:9, color:"#3a3838", letterSpacing:"0.1em", background:"none", border:"none", cursor:"pointer"})}
                  onClick={() => setShowForce(true)}
                >
                  EMERGENCY OVERRIDE ↓
                </button>
              ) : (
                <div style={{display:"flex", flexDirection:"column", gap:10}}>
                  <div style={M({fontSize:9, color:"#ef4444", letterSpacing:"0.1em"})}>
                    ⚠ FORCE SYNC USES ONE OF YOUR 2 DAILY PULLS. ONLY USE IF ABSOLUTELY NECESSARY.
                  </div>
                  <div style={{display:"flex", gap:10}}>
                    <button className="force-btn" onClick={() => runSync(true)}>FORCE SYNC ANYWAY</button>
                    <button
                      onClick={() => setShowForce(false)}
                      style={M({fontSize:9, color:"#8a8784", background:"none", border:"none", cursor:"pointer"})}
                    >
                      CANCEL
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Live result */}
      {syncResult && (
        <div className="card" style={{animationDelay:"0.1s"}}>
          <div className="card-head">
            <div className="card-title">LAST RUN <span>RESULTS</span></div>
            <span style={M({fontSize:9, color:"#22c55e"})}>{(syncResult.durationMs / 1000).toFixed(1)}S</span>
          </div>
          <div className="card-body">
            <div className="stat-grid">
              <div className="stat-box">
                <div className="stat-val">{syncResult.totalParts.toLocaleString()}</div>
                <div className="stat-label">TOTAL IN CATALOG</div>
              </div>
              <div className="stat-box green">
                <div className="stat-val" style={{color:"#22c55e"}}>{syncResult.upserted.toLocaleString()}</div>
                <div className="stat-label">UPSERTED</div>
              </div>
              <div className="stat-box">
                <div className="stat-val" style={{color:"#8a8784"}}>{syncResult.discontinued.toLocaleString()}</div>
                <div className="stat-label">DISCONTINUED</div>
              </div>
              <div className={`stat-box ${syncResult.errors > 0 ? "red" : ""}`}>
                <div className="stat-val" style={{color: syncResult.errors > 0 ? "#ef4444" : "#8a8784"}}>
                  {syncResult.errors}
                </div>
                <div className="stat-label">ERRORS</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Live log */}
      {logs.length > 0 && (
        <div className="card" style={{animationDelay:"0.15s"}}>
          <div className="card-head"><div className="card-title">SYNC <span>LOG</span></div></div>
          <div className="card-body" style={{padding:0}}>
            <div className="live-log">
              {logs.map((log, i) => (
                <div key={i} className={`log-${log.type}`}>[{log.ts}] {log.msg}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* History */}
      {dbStatus?.recentLogs?.length > 0 && (
        <div className="card" style={{animationDelay:"0.2s"}}>
          <div className="card-head"><div className="card-title">SYNC <span>HISTORY</span></div></div>
          <div style={{overflowX:"auto"}}>
            <table className="log-table">
              <thead>
                <tr>
                  <th>DATE & TIME</th><th>STATUS</th><th>UPSERTED</th>
                  <th>SKIPPED</th><th>ERRORS</th><th>DURATION</th>
                </tr>
              </thead>
              <tbody>
                {dbStatus.recentLogs.map((log, i) => (
                  <tr key={i}>
                    <td style={M({fontSize:10, color:"#8a8784"})}>{new Date(log.completed_at).toLocaleString()}</td>
                    <td><span className={`badge badge-${log.status}`}>{log.status.toUpperCase()}</span></td>
                    <td style={{color:"#22c55e"}}>{log.upserted?.toLocaleString() ?? "—"}</td>
                    <td style={{color:"#8a8784"}}>{log.skipped?.toLocaleString() ?? "—"}</td>
                    <td style={{color: log.errors > 0 ? "#ef4444" : "#8a8784"}}>{log.errors ?? 0}</td>
                    <td style={M({fontSize:10, color:"#8a8784"})}>{log.duration_ms ? `${(log.duration_ms/1000).toFixed(1)}s` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================
// WPS PANEL
// ============================================================

function WpsPanel() {
  const [status,     setStatus]     = useState("idle");
  const [syncResult, setSyncResult] = useState(null);
  const [dbStatus,   setDbStatus]   = useState(null);
  const [logs,       setLogs]       = useState([]);

  const addLog = (msg, type = "info") =>
    setLogs(prev => [{ msg, type, ts: new Date().toLocaleTimeString() }, ...prev]);

  const fetchStatus = useCallback(async () => {
    try {
      if (!SYNC_SECRET) {
        addLog("Missing NEXT_PUBLIC_SYNC_SECRET — cannot auth /api/vendors/wps/sync", "error");
        return;
      }
      const res  = await fetch("/api/vendors/wps/sync", {
        headers: { Authorization: `Bearer ${SYNC_SECRET}` },
      });
      const data = await res.json();
      setDbStatus(data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchStatus();
    const iv = setInterval(fetchStatus, 30_000);
    return () => clearInterval(iv);
  }, [fetchStatus]);

  const runSync = async () => {
    setStatus("running");
    setSyncResult(null);
    setLogs([]);
    if (!SYNC_SECRET) {
      addLog("Missing NEXT_PUBLIC_SYNC_SECRET — cannot auth /api/vendors/wps/sync", "error");
      setStatus("error");
      return;
    }
    addLog("Connecting to WPS API...", "info");
    addLog("Requesting dealer pricing job (async — may take 30–60s)...", "info");

    try {
      const res  = await fetch("/api/vendors/wps/sync", {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:  `Bearer ${SYNC_SECRET}`,
        },
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        addLog(`Sync failed: ${data.error ?? "Unknown error"}`, "error");
        setStatus("error");
        return;
      }

      const s = data.summary;
      setSyncResult(s);
      addLog(`✓ Sync complete in ${(s.durationMs / 1000).toFixed(1)}s`, "success");
      addLog(`${s.upserted.toLocaleString()} items upserted to Supabase`, "success");
      addLog(`${s.images.toLocaleString()} product images stored`, "success");
      addLog(`${s.skipped.toLocaleString()} items skipped (no SKU)`, "info");
      if (s.errors > 0) addLog(`${s.errors} batch errors — check server logs`, "error");
      setStatus("done");
      fetchStatus();
    } catch (err) {
      addLog(`Fatal: ${err?.message ?? "Network error"}`, "error");
      setStatus("error");
    }
  };

  const isRunning = status === "running";
  const lastSync  = dbStatus?.lastSyncAt
    ? new Date(dbStatus.lastSyncAt).toLocaleString()
    : null;

  return (
    <>
      {/* API status */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">API <span>STATUS</span></div>
          <span style={M({fontSize:9, color:"#22c55e", letterSpacing:"0.12em"})}>
            ✓ REST API — NO PULL LIMIT
          </span>
        </div>
        <div className="card-body">
          <div className="info-banner" style={{marginBottom:20}}>
            <span style={{fontSize:16}}>⚡</span>
            <div>
              <div style={M({fontSize:9, color:"#3b82f6", letterSpacing:"0.12em", marginBottom:4})}>
                API-NATIVE VENDOR
              </div>
              <div style={{fontSize:13, color:"#c2b9b0"}}>
                WPS has no daily pull limit. Syncs can run on any schedule.
                Pricing uses an async job that takes ~30–60s to generate.
              </div>
            </div>
          </div>
          <div className="stat-grid">
            <div className="stat-box green">
              <div className="stat-val" style={{color:"#22c55e"}}>YES</div>
              <div className="stat-label">CAN SYNC NOW</div>
            </div>
            <div className="stat-box">
              <div className="stat-val">∞</div>
              <div className="stat-label">PULLS PER DAY</div>
            </div>
            <div className="stat-box">
              <div className="stat-val" style={{fontSize:16, paddingTop:4}}>
                {lastSync ?? "—"}
              </div>
              <div className="stat-label">LAST SYNC</div>
            </div>
            <div className="stat-box highlight">
              <div className="stat-val" style={{color:"#e8621a"}}>
                {dbStatus?.totalActiveProducts?.toLocaleString() ?? "—"}
              </div>
              <div className="stat-label">ACTIVE PRODUCTS</div>
            </div>
          </div>
        </div>
      </div>

      {/* Trigger */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">TRIGGER <span>SYNC</span></div>
        </div>
        <div className="card-body">
          <div style={{display:"flex", alignItems:"center", gap:12, flexWrap:"wrap"}}>
            <button
              className="sync-btn"
              onClick={() => !isRunning && runSync()}
              disabled={isRunning}
            >
              {isRunning
                ? <><span className="spinner"/>SYNCING...</>
                : status === "done" ? "SYNC AGAIN" : "START WPS SYNC →"}
            </button>
            {status === "done" && (
              <span style={M({fontSize:9, color:"#22c55e", letterSpacing:"0.12em"})}>✓ SYNC COMPLETE</span>
            )}
            {status === "error" && (
              <span style={M({fontSize:9, color:"#ef4444", letterSpacing:"0.12em"})}>✗ SYNC FAILED — SEE LOGS BELOW</span>
            )}
            {isRunning && (
              <span style={M({fontSize:9, color:"#e8621a", letterSpacing:"0.12em", animation:"pulse 1.5s infinite"})}>
                PRICING JOB RUNNING — MAY TAKE 1–2 MIN
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Live result */}
      {syncResult && (
        <div className="card" style={{animationDelay:"0.1s"}}>
          <div className="card-head">
            <div className="card-title">LAST RUN <span>RESULTS</span></div>
            <span style={M({fontSize:9, color:"#22c55e"})}>{(syncResult.durationMs / 1000).toFixed(1)}S</span>
          </div>
          <div className="card-body">
            <div className="stat-grid">
              <div className="stat-box">
                <div className="stat-val">{syncResult.totalItems.toLocaleString()}</div>
                <div className="stat-label">TOTAL ITEMS</div>
              </div>
              <div className="stat-box green">
                <div className="stat-val" style={{color:"#22c55e"}}>{syncResult.upserted.toLocaleString()}</div>
                <div className="stat-label">UPSERTED</div>
              </div>
              <div className="stat-box highlight">
                <div className="stat-val" style={{color:"#e8621a"}}>{syncResult.images.toLocaleString()}</div>
                <div className="stat-label">IMAGES STORED</div>
              </div>
              <div className={`stat-box ${syncResult.errors > 0 ? "red" : ""}`}>
                <div className="stat-val" style={{color: syncResult.errors > 0 ? "#ef4444" : "#8a8784"}}>
                  {syncResult.errors}
                </div>
                <div className="stat-label">ERRORS</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Live log */}
      {logs.length > 0 && (
        <div className="card" style={{animationDelay:"0.15s"}}>
          <div className="card-head"><div className="card-title">SYNC <span>LOG</span></div></div>
          <div className="card-body" style={{padding:0}}>
            <div className="live-log">
              {logs.map((log, i) => (
                <div key={i} className={`log-${log.type}`}>[{log.ts}] {log.msg}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* History */}
      {dbStatus?.recentLogs?.length > 0 && (
        <div className="card" style={{animationDelay:"0.2s"}}>
          <div className="card-head"><div className="card-title">SYNC <span>HISTORY</span></div></div>
          <div style={{overflowX:"auto"}}>
            <table className="log-table">
              <thead>
                <tr>
                  <th>DATE & TIME</th><th>STATUS</th><th>UPSERTED</th>
                  <th>IMAGES</th><th>ERRORS</th><th>DURATION</th>
                </tr>
              </thead>
              <tbody>
                {dbStatus.recentLogs.map((log, i) => (
                  <tr key={i}>
                    <td style={M({fontSize:10, color:"#8a8784"})}>{new Date(log.completed_at).toLocaleString()}</td>
                    <td><span className={`badge badge-${log.status}`}>{log.status.toUpperCase()}</span></td>
                    <td style={{color:"#22c55e"}}>{log.upserted?.toLocaleString() ?? "—"}</td>
                    <td style={{color:"#e8621a"}}>{log.error_message ?? "—"}</td>
                    <td style={{color: log.errors > 0 ? "#ef4444" : "#8a8784"}}>{log.errors ?? 0}</td>
                    <td style={M({fontSize:10, color:"#8a8784"})}>{log.duration_ms ? `${(log.duration_ms/1000).toFixed(1)}s` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================
// ROOT PAGE
// ============================================================

export default function SyncAdminPage() {
  const [activeTab, setActiveTab] = useState("pu");

  return (
    <div className="sync-wrap">
      <style>{css}</style>
      <NavBar activePage="admin" />

      <div className="sync-header">
        <div style={M({fontSize:9, color:"#e8621a", letterSpacing:"0.25em", marginBottom:6})}>ADMIN</div>
        <div style={B({fontSize:40, letterSpacing:"0.04em", lineHeight:1})}>
          VENDOR <span style={{color:"#e8621a"}}>SYNC</span>
        </div>
        <div style={{fontSize:13, color:"#8a8784", marginTop:4}}>
          Manage product catalog syncs across all vendors
        </div>
      </div>

      <div className="sync-body">
        {/* Tabs */}
        <div className="tabs">
          <button
            className={`tab ${activeTab === "pu" ? "active" : ""}`}
            onClick={() => setActiveTab("pu")}
          >
            PARTS UNLIMITED
            <span className="tab-badge">CSV</span>
          </button>
          <button
            className={`tab ${activeTab === "wps" ? "active" : ""}`}
            onClick={() => setActiveTab("wps")}
          >
            WESTERN POWER SPORTS
            <span className="tab-badge">API</span>
          </button>
        </div>

        {activeTab === "pu"  && <PuPanel />}
        {activeTab === "wps" && <WpsPanel />}
      </div>
    </div>
  );
}
