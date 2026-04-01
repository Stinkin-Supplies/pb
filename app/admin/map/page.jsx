"use client";
// ============================================================
// app/admin/map/page.jsx
// MAP Compliance Dashboard
// — Live violations from /api/admin/map (self-hosted via API)
// — Full audit log from map_audit_log (Supabase)
// — Search, print, vendor filter
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Condensed:wght@300;400;500;600;700&family=Share+Tech+Mono&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --black: #0a0909; --coal: #111010; --iron: #1a1919;
    --steel: #2a2828; --chrome: #8a8784; --cream: #f0ebe3;
    --orange: #e8621a; --gold: #c9a84c; --red: #b91c1c;
    --green: #22c55e; --blue: #3b82f6;
  }

  .map-wrap {
    background: var(--black); min-height: 100vh;
    color: var(--cream); font-family: var(--font-stencil), sans-serif;
  }

  /* ── HEADER ── */
  .map-header {
    background: var(--coal); border-bottom: 1px solid var(--steel);
    padding: 20px 32px; display: flex; align-items: center;
    justify-content: space-between; gap: 16px; flex-wrap: wrap;
  }
  .map-header-left h1 {
    font-family: var(--font-caesar), sans-serif;
    font-size: 28px; letter-spacing: 0.05em;
  }
  .map-header-left h1 span { color: var(--orange); }
  .map-subtitle {
    font-family: var(--font-stencil), monospace;
    font-size: 9px; color: var(--chrome); letter-spacing: 0.15em; margin-top: 2px;
  }
  .map-header-actions { display: flex; gap: 8px; align-items: center; }
  .map-btn {
    font-family: var(--font-stencil), monospace; font-size: 9px;
    letter-spacing: 0.12em; padding: 8px 16px; border-radius: 2px;
    cursor: pointer; transition: all 0.15s; border: 1px solid;
  }
  .map-btn-ghost { background: none; border-color: var(--steel); color: var(--chrome); }
  .map-btn-ghost:hover { border-color: var(--orange); color: var(--orange); }
  .map-btn-primary { background: var(--orange); border-color: var(--orange); color: var(--black); font-weight: 700; }
  .map-btn-primary:hover { background: #c94f0f; }

  /* ── TABS ── */
  .map-tabs {
    background: var(--coal); border-bottom: 1px solid var(--steel);
    padding: 0 32px; display: flex; gap: 0;
  }
  .map-tab {
    font-family: var(--font-stencil), monospace; font-size: 10px;
    letter-spacing: 0.12em; padding: 14px 20px;
    cursor: pointer; border-bottom: 2px solid transparent;
    color: var(--chrome); transition: all 0.15s; background: none; border-top: none;
    border-left: none; border-right: none;
  }
  .map-tab:hover { color: var(--cream); }
  .map-tab.active { color: var(--orange); border-bottom-color: var(--orange); }

  /* ── STATS BAR ── */
  .stats-bar {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 1px; background: var(--steel); border-bottom: 1px solid var(--steel);
  }
  .stat-card {
    background: var(--coal); padding: 20px 24px;
  }
  .stat-val {
    font-family: var(--font-caesar), sans-serif;
    font-size: 36px; line-height: 1; letter-spacing: 0.03em;
  }
  .stat-val.red    { color: var(--red); }
  .stat-val.orange { color: var(--orange); }
  .stat-val.green  { color: var(--green); }
  .stat-val.gold   { color: var(--gold); }
  .stat-label {
    font-family: var(--font-stencil), monospace;
    font-size: 8px; color: var(--chrome); letter-spacing: 0.15em; margin-top: 4px;
  }

  /* ── TOOLBAR ── */
  .map-toolbar {
    padding: 12px 32px; background: var(--black);
    border-bottom: 1px solid var(--iron);
    display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
  }
  .map-search {
    background: var(--iron); border: 1px solid var(--steel);
    color: var(--cream); padding: 8px 12px; border-radius: 2px;
    font-family: var(--font-stencil), monospace; font-size: 11px;
    letter-spacing: 0.06em; width: 280px; outline: none;
    transition: border-color 0.15s;
  }
  .map-search:focus { border-color: var(--orange); }
  .map-search::placeholder { color: #3a3838; }
  .map-filter-btn {
    background: none; border: 1px solid var(--steel); color: var(--chrome);
    padding: 7px 14px; border-radius: 2px; cursor: pointer;
    font-family: var(--font-stencil), monospace; font-size: 9px;
    letter-spacing: 0.1em; transition: all 0.15s;
  }
  .map-filter-btn:hover  { border-color: var(--orange); color: var(--orange); }
  .map-filter-btn.active { border-color: var(--orange); color: var(--orange); background: rgba(232,98,26,0.08); }
  .map-toolbar-right { margin-left: auto; display: flex; gap: 8px; }

  /* ── TABLE ── */
  .map-body { padding: 24px 32px; }
  .map-table-wrap { overflow-x: auto; }
  .map-table {
    width: 100%; border-collapse: collapse;
    font-size: 13px;
  }
  .map-table th {
    font-family: var(--font-stencil), monospace;
    font-size: 8px; color: var(--chrome); letter-spacing: 0.15em;
    padding: 10px 14px; text-align: left;
    border-bottom: 1px solid var(--steel);
    background: var(--coal); white-space: nowrap;
    cursor: pointer; user-select: none; transition: color 0.15s;
  }
  .map-table th:hover { color: var(--orange); }
  .map-table td {
    padding: 11px 14px; border-bottom: 1px solid var(--iron);
    vertical-align: middle;
  }
  .map-table tr:hover td { background: rgba(255,255,255,0.01); }

  .sku-cell {
    font-family: var(--font-stencil), monospace;
    font-size: 10px; color: var(--chrome); letter-spacing: 0.08em;
  }
  .name-cell { font-weight: 600; color: var(--cream); max-width: 220px; }
  .name-cell small {
    display: block; font-family: var(--font-stencil), monospace;
    font-size: 8px; color: var(--chrome); letter-spacing: 0.1em;
    font-weight: 400; margin-top: 2px;
  }
  .price-cell {
    font-family: var(--font-caesar), sans-serif;
    font-size: 18px; letter-spacing: 0.04em; white-space: nowrap;
  }
  .price-cell.violation { color: var(--red); }
  .price-cell.ok        { color: var(--green); }
  .price-delta {
    font-family: var(--font-stencil), monospace;
    font-size: 9px; letter-spacing: 0.08em; margin-top: 2px;
  }
  .price-delta.under { color: var(--red); }
  .price-delta.over  { color: var(--green); }

  .vendor-pill {
    display: inline-block;
    font-family: var(--font-stencil), monospace; font-size: 8px;
    letter-spacing: 0.12em; padding: 3px 8px; border-radius: 1px;
    border: 1px solid;
  }
  .vendor-pill.wps { color: #3b82f6; border-color: rgba(59,130,246,0.3); background: rgba(59,130,246,0.06); }
  .vendor-pill.pu  { color: var(--gold); border-color: rgba(201,168,76,0.3); background: rgba(201,168,76,0.06); }

  .status-pill {
    display: inline-block;
    font-family: var(--font-stencil), monospace; font-size: 8px;
    letter-spacing: 0.1em; padding: 3px 8px; border-radius: 1px; border: 1px solid;
  }
  .status-pill.violation { color: var(--red);    border-color: rgba(185,28,28,0.3);  background: rgba(185,28,28,0.06); }
  .status-pill.ok        { color: var(--green);  border-color: rgba(34,197,94,0.3);  background: rgba(34,197,94,0.06); }
  .status-pill.corrected { color: var(--gold);   border-color: rgba(201,168,76,0.3); background: rgba(201,168,76,0.06); }
  .status-pill.sync      { color: var(--chrome); border-color: var(--steel);         background: var(--iron); }

  .trigger-pill {
    font-family: var(--font-stencil), monospace; font-size: 8px;
    letter-spacing: 0.08em; color: var(--chrome);
  }

  .date-cell {
    font-family: var(--font-stencil), monospace;
    font-size: 9px; color: var(--chrome); letter-spacing: 0.06em;
    white-space: nowrap;
  }

  .count-badge {
    font-family: var(--font-caesar), sans-serif; font-size: 16px;
    color: var(--orange);
  }

  /* ── EMPTY / LOADING ── */
  .map-empty {
    text-align: center; padding: 80px 20px;
    font-family: var(--font-stencil), monospace;
    font-size: 10px; color: #3a3838; letter-spacing: 0.15em;
  }
  .map-loading {
    display: flex; align-items: center; justify-content: center;
    padding: 80px; gap: 12px;
    font-family: var(--font-stencil), monospace;
    font-size: 9px; color: var(--chrome); letter-spacing: 0.12em;
  }
  .spinner {
    width: 18px; height: 18px; border-radius: 50%;
    border: 2px solid var(--steel); border-top-color: var(--orange);
    animation: spin 0.6s linear infinite; flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── PAGINATION ── */
  .map-pagination {
    display: flex; align-items: center; justify-content: space-between;
    padding: 20px 0; margin-top: 8px;
    border-top: 1px solid var(--steel); flex-wrap: wrap; gap: 12px;
  }
  .page-btn {
    font-family: var(--font-stencil), monospace; font-size: 9px; letter-spacing: 0.08em;
    background: var(--coal); border: 1px solid var(--steel); color: var(--chrome);
    padding: 6px 12px; border-radius: 2px; cursor: pointer; transition: all 0.15s;
  }
  .page-btn:hover:not(:disabled) { border-color: var(--orange); color: var(--orange); }
  .page-btn.active { background: var(--orange); border-color: var(--orange); color: var(--black); }
  .page-btn:disabled { opacity: 0.3; cursor: default; }

  /* ── PRINT ── */
  @media print {
    .map-header-actions, .map-tabs, .map-toolbar, .map-pagination { display: none !important; }
    .map-wrap { background: white; color: black; }
    .map-table th, .map-table td { color: black; border-color: #ccc; }
    .stat-card { background: #f5f5f5; }
  }
`;

const PAGE_SIZE = 50;

function fmt(n) {
  return n != null ? `$${Number(n).toFixed(2)}` : "—";
}
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function MapAdminPage() {
  const [tab,          setTab]          = useState("violations"); // violations | audit
  const [violations,   setViolations]   = useState([]);
  const [auditLog,     setAuditLog]     = useState([]);
  const [stats,        setStats]        = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState("");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page,         setPage]         = useState(0);
  const [total,        setTotal]        = useState(0);
  const [sortCol,      setSortCol]      = useState("checked_at");
  const [sortDir,      setSortDir]      = useState("desc");

  const supabase = useRef(createBrowserSupabaseClient()).current;

  // ── Load violations from /api/admin/map ──────────────────
  const loadViolations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        search:  search,
        vendor:  vendorFilter,
        status:  statusFilter,
        page:    String(page),
        sort:    sortCol,
        dir:     sortDir,
      });
      const res  = await fetch(`/api/admin/map?${params}`);
      const data = await res.json();
      setViolations(data.rows      ?? []);
      setTotal(data.total          ?? 0);
      setStats(data.stats          ?? null);
    } catch (e) {
      console.error("[MAP] load violations:", e.message);
    } finally {
      setLoading(false);
    }
  }, [search, vendorFilter, statusFilter, page, sortCol, sortDir]);

  // ── Load audit log from Supabase ─────────────────────────
  const loadAuditLog = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("map_audit_log")
        .select("*", { count: "exact" })
        .order("checked_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (search)              q = q.or(`sku.ilike.%${search}%,product_name.ilike.%${search}%`);
      if (vendorFilter !== "all") q = q.eq("vendor", vendorFilter);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);

      const { data, count, error } = await q;
      if (error) throw error;
      setAuditLog(data  ?? []);
      setTotal(count    ?? 0);
    } catch (e) {
      console.error("[MAP] load audit:", e.message);
    } finally {
      setLoading(false);
    }
  }, [search, vendorFilter, statusFilter, page, supabase]);

  useEffect(() => {
    setPage(0);
  }, [search, vendorFilter, statusFilter, tab]);

  useEffect(() => {
    if (tab === "violations") loadViolations();
    else                      loadAuditLog();
  }, [tab, loadViolations, loadAuditLog]);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const sortIcon = (col) => sortCol === col ? (sortDir === "asc" ? " ▴" : " ▾") : "";

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const rows = tab === "violations" ? violations : auditLog;

  return (
    <div className="map-wrap">
      <style>{css}</style>

      {/* ── Header ── */}
      <div className="map-header">
        <div className="map-header-left">
          <h1>MAP <span>COMPLIANCE</span></h1>
          <div className="map-subtitle">
            ADMIN · MINIMUM ADVERTISED PRICE MONITOR · {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase()}
          </div>
        </div>
        <div className="map-header-actions">
          <button className="map-btn map-btn-ghost" onClick={() => window.print()}>
            ⎙ PRINT / PDF
          </button>
          <button className="map-btn map-btn-primary" onClick={() => {
            if (tab === "violations") loadViolations();
            else loadAuditLog();
          }}>
            ↻ REFRESH
          </button>
        </div>
      </div>

      {/* ── Stats Bar ── */}
      {stats && (
        <div className="stats-bar">
          <div className="stat-card">
            <div className="stat-val red">{stats.violations?.toLocaleString() ?? "—"}</div>
            <div className="stat-label">ACTIVE VIOLATIONS</div>
          </div>
          <div className="stat-card">
            <div className="stat-val orange">{stats.wpsViolations?.toLocaleString() ?? "—"}</div>
            <div className="stat-label">WPS VIOLATIONS</div>
          </div>
          <div className="stat-card">
            <div className="stat-val gold">{stats.puViolations?.toLocaleString() ?? "—"}</div>
            <div className="stat-label">PU VIOLATIONS</div>
          </div>
          <div className="stat-card">
            <div className="stat-val green">{stats.corrected?.toLocaleString() ?? "—"}</div>
            <div className="stat-label">CORRECTED TODAY</div>
          </div>
          <div className="stat-card">
            <div className="stat-val" style={{ color: "var(--cream)" }}>
              {stats.totalChecked?.toLocaleString() ?? "—"}
            </div>
            <div className="stat-label">TOTAL CHECKS TODAY</div>
          </div>
          <div className="stat-card">
            <div className="stat-val" style={{ color: stats.complianceRate >= 99 ? "var(--green)" : "var(--orange)" }}>
              {stats.complianceRate ?? "—"}%
            </div>
            <div className="stat-label">COMPLIANCE RATE</div>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="map-tabs">
        <button className={`map-tab ${tab === "violations" ? "active" : ""}`} onClick={() => setTab("violations")}>
          LIVE VIOLATIONS
        </button>
        <button className={`map-tab ${tab === "audit" ? "active" : ""}`} onClick={() => setTab("audit")}>
          AUDIT LOG
        </button>
      </div>

      {/* ── Toolbar ── */}
      <div className="map-toolbar">
        <input
          className="map-search"
          placeholder="SEARCH SKU OR PRODUCT NAME..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {["all", "wps", "pu"].map(v => (
          <button key={v}
            className={`map-filter-btn ${vendorFilter === v ? "active" : ""}`}
            onClick={() => setVendorFilter(v)}>
            {v.toUpperCase()}
          </button>
        ))}
        <div style={{ width: 1, height: 20, background: "var(--steel)", margin: "0 4px" }}/>
        {["all", "violation", "ok", "corrected"].map(s => (
          <button key={s}
            className={`map-filter-btn ${statusFilter === s ? "active" : ""}`}
            onClick={() => setStatusFilter(s)}>
            {s.toUpperCase()}
          </button>
        ))}
        <div className="map-toolbar-right">
          <span style={{
            fontFamily: "var(--font-stencil), monospace", fontSize: 9,
            color: "var(--chrome)", letterSpacing: "0.1em",
            display: "flex", alignItems: "center",
          }}>
            {loading ? "LOADING..." : `${total.toLocaleString()} RECORDS`}
          </span>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="map-body">
        {loading ? (
          <div className="map-loading">
            <div className="spinner"/>
            LOADING MAP DATA...
          </div>
        ) : rows.length === 0 ? (
          <div className="map-empty">
            {search || vendorFilter !== "all" || statusFilter !== "all"
              ? "NO RECORDS MATCH YOUR FILTERS"
              : tab === "violations"
                ? "✓ NO ACTIVE MAP VIOLATIONS"
                : "NO AUDIT LOG ENTRIES YET"}
          </div>
        ) : (
          <>
            <div className="map-table-wrap">
              <table className="map-table">
                <thead>
                  <tr>
                    <th onClick={() => handleSort("sku")}>SKU{sortIcon("sku")}</th>
                    <th onClick={() => handleSort("product_name")}>PRODUCT{sortIcon("product_name")}</th>
                    <th onClick={() => handleSort("our_price")}>OUR PRICE{sortIcon("our_price")}</th>
                    <th onClick={() => handleSort("map_floor")}>MAP FLOOR{sortIcon("map_floor")}</th>
                    <th onClick={() => handleSort("delta")}>DELTA{sortIcon("delta")}</th>
                    <th onClick={() => handleSort("vendor")}>VENDOR{sortIcon("vendor")}</th>
                    <th onClick={() => handleSort("status")}>STATUS{sortIcon("status")}</th>
                    {tab === "audit" && <th onClick={() => handleSort("trigger")}>TRIGGER{sortIcon("trigger")}</th>}
                    <th onClick={() => handleSort("checked_at")}>
                      {tab === "audit" ? "CHECKED" : "LAST SEEN"}{sortIcon("checked_at")}
                    </th>
                    {tab === "audit" && <th>NOTES</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const delta     = Number(row.delta ?? (row.our_price - (row.map_floor ?? row.map_price ?? 0)));
                    const isViolation = row.status === "violation" || (row.compliance_status === "violation");
                    const status    = row.status ?? row.compliance_status ?? "ok";
                    const vendor    = (row.vendor ?? "wps").toLowerCase();

                    return (
                      <tr key={row.id ?? i}>
                        <td className="sku-cell">{row.sku ?? "—"}</td>
                        <td>
                          <div className="name-cell">
                            {row.product_name ?? row.name ?? "—"}
                            {row.brand_name && <small>{row.brand_name.toUpperCase()}</small>}
                          </div>
                        </td>
                        <td>
                          <div className={`price-cell ${isViolation ? "violation" : "ok"}`}>
                            {fmt(row.our_price)}
                          </div>
                        </td>
                        <td>
                          <div className="price-cell">
                            {fmt(row.map_floor ?? row.map_price)}
                          </div>
                        </td>
                        <td>
                          <div className={`price-delta ${delta < 0 ? "under" : "over"}`}>
                            {delta < 0 ? "▼" : "▲"} {fmt(Math.abs(delta))}
                          </div>
                        </td>
                        <td>
                          <span className={`vendor-pill ${vendor}`}>
                            {vendor.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <span className={`status-pill ${status}`}>
                            {status.toUpperCase()}
                          </span>
                        </td>
                        {tab === "audit" && (
                          <td>
                            <span className="trigger-pill">
                              {(row.trigger ?? "—").toUpperCase()}
                            </span>
                          </td>
                        )}
                        <td className="date-cell">
                          {fmtDate(row.checked_at)}
                        </td>
                        {tab === "audit" && (
                          <td style={{
                            fontFamily: "var(--font-stencil), sans-serif",
                            fontSize: 12, color: "var(--chrome)",
                            maxWidth: 200,
                          }}>
                            {row.notes ?? "—"}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="map-pagination">
                <span style={{
                  fontFamily: "var(--font-stencil), monospace", fontSize: 9,
                  color: "var(--chrome)", letterSpacing: "0.1em",
                }}>
                  SHOWING {(page * PAGE_SIZE + 1).toLocaleString()}–
                  {Math.min((page + 1) * PAGE_SIZE, total).toLocaleString()} OF {total.toLocaleString()}
                </span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="page-btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← PREV</button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    const pg = Math.max(0, Math.min(page - 3, totalPages - 7)) + i;
                    return (
                      <button key={pg} className={`page-btn ${pg === page ? "active" : ""}`} onClick={() => setPage(pg)}>
                        {pg + 1}
                      </button>
                    );
                  })}
                  <button className="page-btn" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>NEXT →</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}