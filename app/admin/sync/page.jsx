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
  ::-webkit-scrollbar { width:4px; } ::-webkit-scrollbar-thumb { background:#c9a84c; }
  @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes spin { to { transform:rotate(360deg); } }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  .sync-wrap { background:#f5f0e8; min-height:100vh; color:#1a1208; font-family:var(--font-stencil),sans-serif; }
  .sync-header { background:#ffffff;border-bottom:1px solid #ddd0b8;padding:28px 24px; }
  .sync-body { max-width:960px;margin:0 auto;padding:28px 24px; }
  .card { background:#ffffff;border:1px solid #ddd0b8;border-radius:3px;margin-bottom:16px;overflow:hidden;animation:fadeUp 0.25s ease both; }
  .card-head { padding:14px 20px;border-bottom:1px solid #ddd0b8;display:flex;align-items:center;justify-content:space-between;gap:12px; }
  .card-title { font-family:var(--font-caesar),sans-serif;font-size:20px;letter-spacing:0.05em; }
  .card-title span { color:#a3822c; }
  .card-body { padding:20px; }
  .stat-grid { display:grid;grid-template-columns:repeat(4,1fr);gap:10px; }
  .stat-box { background:#fbf6ec;border:1px solid #ddd0b8;border-radius:2px;padding:14px 16px; }
  .stat-box.highlight { border-color:rgba(201,168,76,0.35);background:rgba(201,168,76,0.1); }
  .stat-box.green { border-color:rgba(47,133,82,0.3);background:rgba(47,133,82,0.08); }
  .stat-box.red { border-color:rgba(192,57,43,0.3);background:rgba(192,57,43,0.08); }
  .stat-val { font-family:var(--font-caesar),sans-serif;font-size:30px;letter-spacing:0.04em;line-height:1;margin-bottom:4px; }
  .stat-label { font-family:var(--font-stencil),monospace;font-size:8px;color:#7a6a4f;letter-spacing:0.12em; }

  /* Tabs */
  .tabs { display:flex;gap:0;border-bottom:1px solid #ddd0b8;margin-bottom:24px; }
  .tab { font-family:var(--font-caesar),sans-serif;font-size:17px;letter-spacing:0.08em;padding:12px 24px;cursor:pointer;border-bottom:2px solid transparent;color:#7a6a4f;transition:all 0.15s;background:none;border-top:none;border-left:none;border-right:none; }
  .tab:hover { color:#1a1208; }
  .tab.active { color:#a3822c;border-bottom-color:#a3822c; }
  .tab-badge { display:inline-block;background:#ddd0b8;color:#7a6a4f;font-family:var(--font-stencil),monospace;font-size:8px;padding:2px 6px;border-radius:1px;margin-left:8px;vertical-align:middle; }
  .tab.active .tab-badge { background:rgba(201,168,76,0.15);color:#a3822c; }

  /* Cooldown bar */
  .cooldown-wrap { margin-bottom:20px; }
  .cooldown-bar-labels { display:flex;justify-content:space-between;font-family:var(--font-stencil),monospace;font-size:9px;letter-spacing:0.1em;margin-bottom:6px; }
  .cooldown-bar-track { height:6px;background:#ddd0b8;border-radius:3px;overflow:hidden; }
  .cooldown-bar-fill { height:100%;border-radius:3px;transition:width 0.5s ease; }

  /* Sync button */
  .sync-btn { background:#c9a84c;border:none;color:#1a1208;font-family:var(--font-caesar),sans-serif;font-size:18px;letter-spacing:0.1em;padding:12px 32px;border-radius:2px;cursor:pointer;transition:all 0.2s;white-space:nowrap; }
  .sync-btn:hover:not(:disabled) { background:#a3822c; transform:translateY(-1px); }
  .sync-btn:disabled { opacity:0.35;cursor:not-allowed;transform:none; }
  .sync-btn.blocked { background:#ddd0b8;color:#7a6a4f; }
  .force-btn { background:transparent;border:1px solid rgba(192,57,43,0.35);color:#c0392b;font-family:var(--font-stencil),monospace;font-size:9px;letter-spacing:0.12em;padding:7px 14px;border-radius:2px;cursor:pointer;transition:all 0.2s; }
  .force-btn:hover { background:rgba(192,57,43,0.1); }
  .spinner { width:14px;height:14px;border-radius:50%;border:2px solid rgba(26,18,8,0.3);border-top-color:#1a1208;animation:spin 0.7s linear infinite;display:inline-block;vertical-align:middle;margin-right:8px; }

  /* Log table */
  .log-table { width:100%;border-collapse:collapse; }
  .log-table th { font-family:var(--font-stencil),monospace;font-size:8px;color:#7a6a4f;letter-spacing:0.12em;padding:8px 12px;text-align:left;border-bottom:1px solid #ddd0b8; }
  .log-table td { padding:10px 12px;border-bottom:1px solid #e6dcc0;font-size:13px;font-weight:500; }
  .log-table tr:last-child td { border-bottom:none; }
  .badge { font-family:var(--font-stencil),monospace;font-size:8px;letter-spacing:0.1em;padding:2px 8px;border-radius:1px; }
  .badge-success { background:rgba(47,133,82,0.12);color:#2f8552;border:1px solid rgba(47,133,82,0.3); }
  .badge-error { background:rgba(192,57,43,0.12);color:#c0392b;border:1px solid rgba(192,57,43,0.3); }

  /* Live log */
  .live-log { background:#fbf6ec;border:1px solid #ddd0b8;border-radius:2px;padding:14px;font-family:var(--font-stencil),monospace;font-size:10px;color:#7a6a4f;letter-spacing:0.06em;line-height:1.8;max-height:240px;overflow-y:auto; }
  .live-log .log-success { color:#2f8552; }
  .live-log .log-error { color:#c0392b; }
  .live-log .log-warn { color:#9a5a0c; }

  /* Warning banner */
  .warn-banner { background:rgba(201,168,76,0.1);border:1px solid rgba(201,168,76,0.3);border-radius:2px;padding:12px 16px;display:flex;gap:10px;align-items:flex-start; }

  /* Info banner */
  .info-banner { background:rgba(59,120,216,0.08);border:1px solid rgba(59,120,216,0.2);border-radius:2px;padding:12px 16px;display:flex;gap:10px;align-items:flex-start; }

  @media (max-width:700px) {
    .stat-grid { grid-template-columns:1fr 1fr; }
    .tabs { overflow-x:auto; }
  }
`;

const PU_COOLDOWN = 10;

// ── Helper styles ─────────────────────────────────────────────
const B = (s) => ({ fontFamily: "var(--font-caesar),sans-serif", ...s });
const M = (s) => ({ fontFamily: "var(--font-stencil),monospace", ...s });

async function readJsonResponse(res, context) {
  const text = await res.text();
  if (!text.trim()) {
    return null;
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json") && !contentType.includes("+json")) {
    throw new Error(
      `${context} returned non-JSON (${contentType || "unknown"}): ${text.slice(0, 200)}`
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${context} returned invalid JSON: ${text.slice(0, 200)}`);
  }
}

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
      const res  = await fetch("/api/admin/parts-unlimited/sync");
      const data = await readJsonResponse(res, "Parts Unlimited status");
      setDbStatus(data);
    } catch (err) {
      console.warn("[PU Sync]", err?.message ?? err);
    }
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
    };
    if (force) {
      headers["x-force-sync"] = "true";
      addLog("⚠ Force override active — cooldown bypassed!", "warn");
    }

    try {
      const res  = await fetch("/api/admin/parts-unlimited/sync", { method: "POST", headers });
      const data = await readJsonResponse(res, "Parts Unlimited sync");

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
          <span style={M({fontSize:9, color: canSync ? "#2f8552" : "#9a5a0c", letterSpacing:"0.12em"})}>
            {canSync ? "✓ READY TO SYNC" : `⏳ ${hoursRemaining.toFixed(1)}H REMAINING`}
          </span>
        </div>
        <div className="card-body">
          <div className="cooldown-wrap">
            <div className="cooldown-bar-labels">
              <span style={{color: canSync ? "#2f8552" : "#9a5a0c"}}>
                {canSync ? "COOLDOWN EXPIRED — READY" : `COOLDOWN ACTIVE — ${hoursRemaining.toFixed(1)}H LEFT`}
              </span>
              <span style={{color:"#7a6a4f"}}>{dbStatus?.cooldownHours ?? PU_COOLDOWN}H WINDOW</span>
            </div>
            <div className="cooldown-bar-track">
              <div
                className="cooldown-bar-fill"
                style={{
                  width: `${cooldownPct}%`,
                  background: canSync
                    ? "linear-gradient(90deg,#2f8552,#1f6b3f)"
                    : "linear-gradient(90deg,#c9a84c,#a3822c)",
                }}
              />
            </div>
          </div>
          <div className="stat-grid">
            <div className={`stat-box ${canSync ? "green" : ""}`}>
              <div className="stat-val" style={{color: canSync ? "#2f8552" : "#9a5a0c"}}>
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
              <div className="stat-val" style={{color:"#a3822c"}}>
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
                <div style={M({fontSize:9, color:"#9a5a0c", letterSpacing:"0.12em", marginBottom:4})}>
                  COOLDOWN ACTIVE
                </div>
                <div style={{fontSize:13, color:"#5a4d38"}}>
                  Last sync completed {dbStatus?.hoursSinceLastSync}h ago. Next sync allowed at{" "}
                  <strong style={{color:"#1a1208"}}>
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
              <span style={M({fontSize:9, color:"#2f8552", letterSpacing:"0.12em"})}>✓ SYNC COMPLETE</span>
            )}
            {status === "error" && (
              <span style={M({fontSize:9, color:"#c0392b", letterSpacing:"0.12em"})}>✗ SYNC FAILED — SEE LOGS BELOW</span>
            )}
            {isRunning && (
              <span style={M({fontSize:9, color:"#a3822c", letterSpacing:"0.12em", animation:"pulse 1.5s infinite"})}>
                DO NOT CLOSE THIS PAGE
              </span>
            )}
          </div>

          {!canSync && !isRunning && (
            <div style={{marginTop:16, paddingTop:16, borderTop:"1px solid #e6dcc0"}}>
              {!showForce ? (
                <button
                  style={M({fontSize:9, color:"#b8ab87", letterSpacing:"0.1em", background:"none", border:"none", cursor:"pointer"})}
                  onClick={() => setShowForce(true)}
                >
                  EMERGENCY OVERRIDE ↓
                </button>
              ) : (
                <div style={{display:"flex", flexDirection:"column", gap:10}}>
                  <div style={M({fontSize:9, color:"#c0392b", letterSpacing:"0.1em"})}>
                    ⚠ FORCE SYNC USES ONE OF YOUR 2 DAILY PULLS. ONLY USE IF ABSOLUTELY NECESSARY.
                  </div>
                  <div style={{display:"flex", gap:10}}>
                    <button className="force-btn" onClick={() => runSync(true)}>FORCE SYNC ANYWAY</button>
                    <button
                      onClick={() => setShowForce(false)}
                      style={M({fontSize:9, color:"#7a6a4f", background:"none", border:"none", cursor:"pointer"})}
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
            <span style={M({fontSize:9, color:"#2f8552"})}>{(syncResult.durationMs / 1000).toFixed(1)}S</span>
          </div>
          <div className="card-body">
            <div className="stat-grid">
              <div className="stat-box">
                <div className="stat-val">{syncResult.totalParts.toLocaleString()}</div>
                <div className="stat-label">TOTAL IN CATALOG</div>
              </div>
              <div className="stat-box green">
                <div className="stat-val" style={{color:"#2f8552"}}>{syncResult.upserted.toLocaleString()}</div>
                <div className="stat-label">UPSERTED</div>
              </div>
              <div className="stat-box">
                <div className="stat-val" style={{color:"#7a6a4f"}}>{syncResult.discontinued.toLocaleString()}</div>
                <div className="stat-label">DISCONTINUED</div>
              </div>
              <div className={`stat-box ${syncResult.errors > 0 ? "red" : ""}`}>
                <div className="stat-val" style={{color: syncResult.errors > 0 ? "#c0392b" : "#7a6a4f"}}>
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
                    <td style={M({fontSize:10, color:"#7a6a4f"})}>{new Date(log.completed_at).toLocaleString()}</td>
                    <td><span className={`badge badge-${log.status}`}>{log.status.toUpperCase()}</span></td>
                    <td style={{color:"#2f8552"}}>{log.upserted?.toLocaleString() ?? "—"}</td>
                    <td style={{color:"#7a6a4f"}}>{log.skipped?.toLocaleString() ?? "—"}</td>
                    <td style={{color: log.errors > 0 ? "#c0392b" : "#7a6a4f"}}>{log.errors ?? 0}</td>
                    <td style={M({fontSize:10, color:"#7a6a4f"})}>{log.duration_ms ? `${(log.duration_ms/1000).toFixed(1)}s` : "—"}</td>
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
      const res  = await fetch("/api/admin/wps/sync");
      const data = await readJsonResponse(res, "WPS status");
      setDbStatus(data);
    } catch (err) {
      console.warn("[WPS Sync]", err?.message ?? err);
    }
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
    addLog("Connecting to WPS API...", "info");
    addLog("Requesting dealer pricing job (async — may take 30–60s)...", "info");

    try {
      const res  = await fetch("/api/admin/wps/sync", {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      const data = await readJsonResponse(res, "WPS sync");

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
          <span style={M({fontSize:9, color:"#2f8552", letterSpacing:"0.12em"})}>
            ✓ REST API — NO PULL LIMIT
          </span>
        </div>
        <div className="card-body">
          <div className="info-banner" style={{marginBottom:20}}>
            <span style={{fontSize:16}}>⚡</span>
            <div>
              <div style={M({fontSize:9, color:"#3b78d8", letterSpacing:"0.12em", marginBottom:4})}>
                API-NATIVE VENDOR
              </div>
              <div style={{fontSize:13, color:"#5a4d38"}}>
                WPS has no daily pull limit. Syncs can run on any schedule.
                Pricing uses an async job that takes ~30–60s to generate.
              </div>
            </div>
          </div>
          <div className="stat-grid">
            <div className="stat-box green">
              <div className="stat-val" style={{color:"#2f8552"}}>YES</div>
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
              <div className="stat-val" style={{color:"#a3822c"}}>
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
              <span style={M({fontSize:9, color:"#2f8552", letterSpacing:"0.12em"})}>✓ SYNC COMPLETE</span>
            )}
            {status === "error" && (
              <span style={M({fontSize:9, color:"#c0392b", letterSpacing:"0.12em"})}>✗ SYNC FAILED — SEE LOGS BELOW</span>
            )}
            {isRunning && (
              <span style={M({fontSize:9, color:"#a3822c", letterSpacing:"0.12em", animation:"pulse 1.5s infinite"})}>
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
            <span style={M({fontSize:9, color:"#2f8552"})}>{(syncResult.durationMs / 1000).toFixed(1)}S</span>
          </div>
          <div className="card-body">
            <div className="stat-grid">
              <div className="stat-box">
                <div className="stat-val">{syncResult.totalItems.toLocaleString()}</div>
                <div className="stat-label">TOTAL ITEMS</div>
              </div>
              <div className="stat-box green">
                <div className="stat-val" style={{color:"#2f8552"}}>{syncResult.upserted.toLocaleString()}</div>
                <div className="stat-label">UPSERTED</div>
              </div>
              <div className="stat-box highlight">
                <div className="stat-val" style={{color:"#a3822c"}}>{syncResult.images.toLocaleString()}</div>
                <div className="stat-label">IMAGES STORED</div>
              </div>
              <div className={`stat-box ${syncResult.errors > 0 ? "red" : ""}`}>
                <div className="stat-val" style={{color: syncResult.errors > 0 ? "#c0392b" : "#7a6a4f"}}>
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
                    <td style={M({fontSize:10, color:"#7a6a4f"})}>{new Date(log.completed_at).toLocaleString()}</td>
                    <td><span className={`badge badge-${log.status}`}>{log.status.toUpperCase()}</span></td>
                    <td style={{color:"#2f8552"}}>{log.upserted?.toLocaleString() ?? "—"}</td>
                    <td style={{color:"#a3822c"}}>{log.error_message ?? "—"}</td>
                    <td style={{color: log.errors > 0 ? "#c0392b" : "#7a6a4f"}}>{log.errors ?? 0}</td>
                    <td style={M({fontSize:10, color:"#7a6a4f"})}>{log.duration_ms ? `${(log.duration_ms/1000).toFixed(1)}s` : "—"}</td>
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
// SYNC LOG VIEWER — full searchable history for both vendors
// ============================================================

function SyncLogViewer() {
  const [logs,         setLogs]         = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState("");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page,         setPage]         = useState(0);
  const [total,        setTotal]        = useState(0);

  const PAGE_SIZE = 25;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        vendor: vendorFilter,
        status: statusFilter,
        page:   String(page),
        limit:  String(PAGE_SIZE),
      });
      const res  = await fetch(`/api/admin/sync-log?${params}`, {
        headers: { 'x-sync-secret': process.env.NEXT_PUBLIC_SYNC_SECRET ?? '' }
      });
      const data = await readJsonResponse(res, "Sync log");
      setLogs(data.logs  ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      console.error("[SyncLog]", e.message);
    } finally {
      setLoading(false);
    }
  }, [vendorFilter, statusFilter, page]);

  useEffect(() => { setPage(0); }, [vendorFilter, statusFilter]);
  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const filtered = search
    ? logs.filter(l =>
        l.vendor?.toLowerCase().includes(search.toLowerCase()) ||
        l.status?.toLowerCase().includes(search.toLowerCase()) ||
        l.error_message?.toLowerCase().includes(search.toLowerCase())
      )
    : logs;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">SYNC <span>LOG VIEWER</span></div>
        <span style={M({fontSize:9, color:"#7a6a4f", letterSpacing:"0.1em"})}>
          {total.toLocaleString()} TOTAL RUNS
        </span>
      </div>
      <div className="card-body">

        {/* Toolbar */}
        <div style={{display:"flex", gap:8, marginBottom:16, flexWrap:"wrap", alignItems:"center"}}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="SEARCH LOGS..."
            style={{
              background:"#fbf6ec", border:"1px solid #ddd0b8", color:"#1a1208",
              fontFamily:"var(--font-stencil),monospace", fontSize:11,
              letterSpacing:"0.06em", padding:"7px 12px", borderRadius:2,
              outline:"none", width:220,
            }}
          />
          {["all","wps","pu"].map(v => (
            <button key={v}
              onClick={() => setVendorFilter(v)}
              style={{
                background: vendorFilter===v ? "rgba(201,168,76,0.1)" : "none",
                border: `1px solid ${vendorFilter===v ? "#a3822c" : "#ddd0b8"}`,
                color: vendorFilter===v ? "#a3822c" : "#7a6a4f",
                fontFamily:"var(--font-stencil),monospace", fontSize:9,
                letterSpacing:"0.1em", padding:"6px 12px", borderRadius:2,
                cursor:"pointer", transition:"all 0.15s",
              }}>
              {v.toUpperCase()}
            </button>
          ))}
          <div style={{width:1, height:20, background:"#ddd0b8"}}/>
          {["all","success","error"].map(s => (
            <button key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                background: statusFilter===s ? "rgba(201,168,76,0.1)" : "none",
                border: `1px solid ${statusFilter===s ? "#a3822c" : "#ddd0b8"}`,
                color: statusFilter===s ? "#a3822c" : "#7a6a4f",
                fontFamily:"var(--font-stencil),monospace", fontSize:9,
                letterSpacing:"0.1em", padding:"6px 12px", borderRadius:2,
                cursor:"pointer", transition:"all 0.15s",
              }}>
              {s.toUpperCase()}
            </button>
          ))}
          <button
            onClick={fetchLogs}
            style={{
              marginLeft:"auto", background:"none",
              border:"1px solid #ddd0b8", color:"#7a6a4f",
              fontFamily:"var(--font-stencil),monospace", fontSize:9,
              letterSpacing:"0.1em", padding:"6px 12px", borderRadius:2,
              cursor:"pointer", transition:"all 0.15s",
            }}>
            ↻ REFRESH
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <div style={{textAlign:"center", padding:40}}>
            <div style={{width:20, height:20, borderRadius:"50%", border:"2px solid #ddd0b8", borderTopColor:"#a3822c", animation:"spin 0.6s linear infinite", display:"inline-block"}}/>
          </div>
        ) : filtered.length === 0 ? (
          <div style={M({fontSize:10, color:"#b8ab87", letterSpacing:"0.12em", padding:"40px 0", textAlign:"center"})}>
            NO SYNC LOGS FOUND
          </div>
        ) : (
          <div style={{overflowX:"auto"}}>
            <table className="log-table">
              <thead>
                <tr>
                  <th>DATE & TIME</th>
                  <th>VENDOR</th>
                  <th>STATUS</th>
                  <th>UPSERTED</th>
                  <th>SKIPPED</th>
                  <th>ERRORS</th>
                  <th>DURATION</th>
                  <th>NOTES</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log, i) => (
                  <tr key={i}>
                    <td style={M({fontSize:10, color:"#7a6a4f", whiteSpace:"nowrap"})}>
                      {new Date(log.completed_at).toLocaleString()}
                    </td>
                    <td>
                      <span style={{
                        fontFamily:"var(--font-stencil),monospace", fontSize:8,
                        letterSpacing:"0.12em", padding:"2px 8px", borderRadius:1,
                        border:"1px solid",
                        color:      log.vendor==="wps" ? "#3b78d8" : "#a3822c",
                        borderColor:log.vendor==="wps" ? "rgba(59,120,216,0.3)" : "rgba(201,168,76,0.3)",
                        background: log.vendor==="wps" ? "rgba(59,120,216,0.08)" : "rgba(201,168,76,0.08)",
                      }}>
                        {(log.vendor ?? "—").toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${log.status}`}>
                        {(log.status ?? "—").toUpperCase()}
                      </span>
                    </td>
                    <td style={{color:"#2f8552"}}>{log.upserted?.toLocaleString() ?? "—"}</td>
                    <td style={{color:"#7a6a4f"}}>{log.skipped?.toLocaleString() ?? "—"}</td>
                    <td style={{color: log.errors > 0 ? "#c0392b" : "#7a6a4f"}}>{log.errors ?? 0}</td>
                    <td style={M({fontSize:10, color:"#7a6a4f", whiteSpace:"nowrap"})}>
                      {log.duration_ms ? `${(log.duration_ms / 1000).toFixed(1)}s` : "—"}
                    </td>
                    <td style={{fontSize:12, color:"#7a6a4f", maxWidth:200}}>
                      {log.error_message ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", paddingTop:16, marginTop:8, borderTop:"1px solid #ddd0b8", flexWrap:"wrap", gap:8}}>
            <span style={M({fontSize:9, color:"#7a6a4f", letterSpacing:"0.1em"})}>
              PAGE {page + 1} OF {totalPages}
            </span>
            <div style={{display:"flex", gap:6}}>
              <button
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
                style={{background:"#ffffff", border:"1px solid #ddd0b8", color: page===0 ? "#b8ab87" : "#7a6a4f", fontFamily:"var(--font-stencil),monospace", fontSize:9, letterSpacing:"0.08em", padding:"5px 12px", borderRadius:2, cursor: page===0 ? "default" : "pointer"}}>
                ← PREV
              </button>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
                style={{background:"#ffffff", border:"1px solid #ddd0b8", color: page>=totalPages-1 ? "#b8ab87" : "#7a6a4f", fontFamily:"var(--font-stencil),monospace", fontSize:9, letterSpacing:"0.08em", padding:"5px 12px", borderRadius:2, cursor: page>=totalPages-1 ? "default" : "pointer"}}>
                NEXT →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
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
        <div style={M({fontSize:9, color:"#a3822c", letterSpacing:"0.25em", marginBottom:6})}>ADMIN</div>
        <div style={B({fontSize:40, letterSpacing:"0.04em", lineHeight:1})}>
          VENDOR <span style={{color:"#a3822c"}}>SYNC</span>
        </div>
        <div style={{fontSize:13, color:"#7a6a4f", marginTop:4}}>
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
          <button
            className={`tab ${activeTab === "log" ? "active" : ""}`}
            onClick={() => setActiveTab("log")}
          >
            SYNC HISTORY
            <span className="tab-badge">LOG</span>
          </button>
        </div>

        {activeTab === "pu"  && <PuPanel />}
        {activeTab === "wps" && <WpsPanel />}
        {activeTab === "log" && <SyncLogViewer />}
      </div>
    </div>
  );
}
