"use client";
// ============================================================
// app/admin/backorders/page.jsx
// ============================================================
// View + manage stock_notifications table.
// Shows who is waiting on what, from which source,
// and lets admin mark notifications as cancelled.
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Condensed:wght@300;400;500;600;700&family=Share+Tech+Mono&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .bo-wrap {
    background: #0a0909; min-height: 100vh;
    color: #f0ebe3; font-family: 'Barlow Condensed', sans-serif;
  }

  /* ── HEADER ── */
  .bo-header {
    background: #111010; border-bottom: 1px solid #2a2828;
    padding: 20px 32px; display: flex; align-items: center;
    justify-content: space-between; gap: 16px; flex-wrap: wrap;
  }
  .bo-title {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 28px; letter-spacing: 0.05em;
  }
  .bo-title span { color: #e8621a; }
  .bo-subtitle {
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px; color: #8a8784; letter-spacing: 0.15em; margin-top: 2px;
  }

  /* ── STATS ── */
  .bo-stats {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 1px; background: #2a2828; border-bottom: 1px solid #2a2828;
  }
  .bo-stat {
    background: #111010; padding: 18px 24px;
  }
  .bo-stat-val {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 32px; line-height: 1; letter-spacing: 0.03em;
  }
  .bo-stat-val.orange { color: #e8621a; }
  .bo-stat-val.gold   { color: #c9a84c; }
  .bo-stat-val.green  { color: #22c55e; }
  .bo-stat-val.grey   { color: #8a8784; }
  .bo-stat-label {
    font-family: 'Share Tech Mono', monospace;
    font-size: 8px; color: #8a8784; letter-spacing: 0.15em; margin-top: 4px;
  }

  /* ── TOOLBAR ── */
  .bo-toolbar {
    padding: 12px 32px; background: #0a0909;
    border-bottom: 1px solid #1a1919;
    display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
  }
  .bo-search {
    background: #1a1919; border: 1px solid #2a2828;
    color: #f0ebe3; padding: 8px 12px; border-radius: 2px;
    font-family: 'Share Tech Mono', monospace; font-size: 11px;
    letter-spacing: 0.06em; width: 260px; outline: none;
    transition: border-color 0.15s;
  }
  .bo-search:focus { border-color: #e8621a; }
  .bo-search::placeholder { color: #3a3838; }
  .bo-filter {
    background: none; border: 1px solid #2a2828; color: #8a8784;
    padding: 7px 14px; border-radius: 2px; cursor: pointer;
    font-family: 'Share Tech Mono', monospace; font-size: 9px;
    letter-spacing: 0.1em; transition: all 0.15s;
  }
  .bo-filter:hover  { border-color: #e8621a; color: #e8621a; }
  .bo-filter.active { border-color: #e8621a; color: #e8621a; background: rgba(232,98,26,0.08); }
  .bo-toolbar-right { margin-left: auto; display: flex; gap: 8px; align-items: center; }
  .bo-count {
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px; color: #8a8784; letter-spacing: 0.1em;
  }

  /* ── TABLE ── */
  .bo-body { padding: 24px 32px; }
  .bo-table-wrap { overflow-x: auto; }
  .bo-table {
    width: 100%; border-collapse: collapse; font-size: 13px;
  }
  .bo-table th {
    font-family: 'Share Tech Mono', monospace;
    font-size: 8px; color: #8a8784; letter-spacing: 0.15em;
    padding: 10px 14px; text-align: left;
    border-bottom: 1px solid #2a2828;
    background: #111010; white-space: nowrap;
  }
  .bo-table td {
    padding: 11px 14px; border-bottom: 1px solid #1a1919;
    vertical-align: middle;
  }
  .bo-table tr:hover td { background: rgba(255,255,255,0.01); }

  .sku-mono {
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px; color: #8a8784; letter-spacing: 0.08em;
  }
  .product-name { font-weight: 600; color: #f0ebe3; }
  .product-name small {
    display: block; font-family: 'Share Tech Mono', monospace;
    font-size: 8px; color: #8a8784; letter-spacing: 0.1em;
    font-weight: 400; margin-top: 2px;
  }
  .email-cell {
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px; color: #c4c0bc; letter-spacing: 0.04em;
  }
  .date-cell {
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px; color: #8a8784; letter-spacing: 0.06em;
    white-space: nowrap;
  }

  .source-pill {
    display: inline-block;
    font-family: 'Share Tech Mono', monospace; font-size: 8px;
    letter-spacing: 0.1em; padding: 3px 8px; border-radius: 1px; border: 1px solid;
  }
  .source-pill.pdp      { color: #3b82f6; border-color: rgba(59,130,246,0.3);  background: rgba(59,130,246,0.06); }
  .source-pill.cart     { color: #e8621a; border-color: rgba(232,98,26,0.3);   background: rgba(232,98,26,0.06); }
  .source-pill.wishlist { color: #c9a84c; border-color: rgba(201,168,76,0.3);  background: rgba(201,168,76,0.06); }

  .status-pill {
    display: inline-block;
    font-family: 'Share Tech Mono', monospace; font-size: 8px;
    letter-spacing: 0.1em; padding: 3px 8px; border-radius: 1px; border: 1px solid;
  }
  .status-pill.waiting          { color: #c9a84c; border-color: rgba(201,168,76,0.3);  background: rgba(201,168,76,0.06); }
  .status-pill.notified_pending { color: #3b82f6; border-color: rgba(59,130,246,0.3);  background: rgba(59,130,246,0.06); }
  .status-pill.notified         { color: #22c55e; border-color: rgba(34,197,94,0.3);   background: rgba(34,197,94,0.06); }
  .status-pill.cancelled        { color: #8a8784; border-color: #2a2828;               background: #1a1919; }

  .vendor-pill {
    display: inline-block;
    font-family: 'Share Tech Mono', monospace; font-size: 8px;
    letter-spacing: 0.12em; padding: 3px 8px; border-radius: 1px; border: 1px solid;
  }
  .vendor-pill.wps { color: #3b82f6; border-color: rgba(59,130,246,0.3); background: rgba(59,130,246,0.06); }
  .vendor-pill.pu  { color: #c9a84c; border-color: rgba(201,168,76,0.3); background: rgba(201,168,76,0.06); }

  .cancel-btn {
    background: none; border: 1px solid #2a2828; color: #8a8784;
    font-family: 'Share Tech Mono', monospace; font-size: 8px;
    letter-spacing: 0.1em; padding: 4px 10px; border-radius: 2px;
    cursor: pointer; transition: all 0.15s;
  }
  .cancel-btn:hover { border-color: #b91c1c; color: #ef4444; }

  /* ── EMPTY / LOADING ── */
  .bo-empty {
    text-align: center; padding: 80px 20px;
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px; color: #3a3838; letter-spacing: 0.15em;
  }
  .bo-loading {
    display: flex; align-items: center; justify-content: center;
    padding: 80px; gap: 12px;
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px; color: #8a8784; letter-spacing: 0.12em;
  }
  .spinner {
    width: 18px; height: 18px; border-radius: 50%;
    border: 2px solid #2a2828; border-top-color: #e8621a;
    animation: spin 0.6s linear infinite; flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── PAGINATION ── */
  .bo-pagination {
    display: flex; align-items: center; justify-content: space-between;
    padding: 20px 0; margin-top: 8px;
    border-top: 1px solid #2a2828; flex-wrap: wrap; gap: 12px;
  }
  .page-btn {
    font-family: 'Share Tech Mono', monospace; font-size: 9px;
    letter-spacing: 0.08em; background: #111010;
    border: 1px solid #2a2828; color: #8a8784;
    padding: 6px 12px; border-radius: 2px; cursor: pointer; transition: all 0.15s;
  }
  .page-btn:hover:not(:disabled) { border-color: #e8621a; color: #e8621a; }
  .page-btn.active { background: #e8621a; border-color: #e8621a; color: #0a0909; }
  .page-btn:disabled { opacity: 0.3; cursor: default; }
`;

const PAGE_SIZE = 50;

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function BackordersPage() {
  const [rows,         setRows]         = useState([]);
  const [stats,        setStats]        = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("waiting");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [page,         setPage]         = useState(0);
  const [total,        setTotal]        = useState(0);
  const [cancelling,   setCancelling]   = useState(null);

  const supabase = useRef(createBrowserSupabaseClient()).current;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // ── Stats query ─────────────────────────────────────
      const { data: allRows } = await supabase
        .from("stock_notifications")
        .select("status, vendor, source");

      const all = allRows ?? [];
      setStats({
        waiting:          all.filter(r => r.status === "waiting").length,
        notified:         all.filter(r => r.status === "notified").length,
        notified_pending: all.filter(r => r.status === "notified_pending").length,
        cancelled:        all.filter(r => r.status === "cancelled").length,
        total:            all.length,
        wps:              all.filter(r => r.vendor === "wps" && r.status === "waiting").length,
        pu:               all.filter(r => r.vendor === "pu"  && r.status === "waiting").length,
      });

      // ── Main query ──────────────────────────────────────
      let q = supabase
        .from("stock_notifications")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (vendorFilter !== "all") q = q.eq("vendor", vendorFilter);
      if (sourceFilter !== "all") q = q.eq("source", sourceFilter);
      if (search) q = q.or(
        `product_sku.ilike.%${search}%,product_name.ilike.%${search}%,email.ilike.%${search}%`
      );

      const { data, count, error } = await q;
      if (error) throw error;
      setRows(data  ?? []);
      setTotal(count ?? 0);
    } catch (e) {
      console.error("[Backorders]", e.message);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, vendorFilter, sourceFilter, page, supabase]);

  useEffect(() => { setPage(0); }, [search, statusFilter, vendorFilter, sourceFilter]);
  useEffect(() => { load(); }, [load]);

  const handleCancel = async (id) => {
    setCancelling(id);
    await supabase
      .from("stock_notifications")
      .update({ status: "cancelled" })
      .eq("id", id);
    setRows(prev => prev.map(r => r.id === id ? { ...r, status: "cancelled" } : r));
    setStats(prev => prev ? { ...prev, waiting: prev.waiting - 1, cancelled: prev.cancelled + 1 } : prev);
    setCancelling(null);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="bo-wrap">
      <style>{css}</style>

      {/* ── Header ── */}
      <div className="bo-header">
        <div>
          <div className="bo-title">BACK<span>ORDER</span> ALERTS</div>
          <div className="bo-subtitle">
            ADMIN · STOCK NOTIFICATION QUEUE · {new Date().toLocaleDateString("en-US", {
              month: "short", day: "numeric", year: "numeric"
            }).toUpperCase()}
          </div>
        </div>
        <button
          onClick={load}
          style={{
            background: "none", border: "1px solid #2a2828", color: "#8a8784",
            fontFamily: "'Share Tech Mono', monospace", fontSize: 9,
            letterSpacing: "0.12em", padding: "8px 16px", borderRadius: 2,
            cursor: "pointer", transition: "all 0.15s",
          }}
          onMouseOver={e => { e.target.style.borderColor = "#e8621a"; e.target.style.color = "#e8621a"; }}
          onMouseOut={e =>  { e.target.style.borderColor = "#2a2828"; e.target.style.color = "#8a8784"; }}
        >
          ↻ REFRESH
        </button>
      </div>

      {/* ── Stats ── */}
      {stats && (
        <div className="bo-stats">
          <div className="bo-stat">
            <div className="bo-stat-val orange">{stats.waiting.toLocaleString()}</div>
            <div className="bo-stat-label">WAITING</div>
          </div>
          <div className="bo-stat">
            <div className="bo-stat-val" style={{ color: "#3b82f6" }}>{stats.notified_pending.toLocaleString()}</div>
            <div className="bo-stat-label">NOTIFY PENDING</div>
          </div>
          <div className="bo-stat">
            <div className="bo-stat-val green">{stats.notified.toLocaleString()}</div>
            <div className="bo-stat-label">NOTIFIED</div>
          </div>
          <div className="bo-stat">
            <div className="bo-stat-val grey">{stats.cancelled.toLocaleString()}</div>
            <div className="bo-stat-label">CANCELLED</div>
          </div>
          <div className="bo-stat">
            <div className="bo-stat-val" style={{ color: "#3b82f6" }}>{stats.wps.toLocaleString()}</div>
            <div className="bo-stat-label">WPS WAITING</div>
          </div>
          <div className="bo-stat">
            <div className="bo-stat-val gold">{stats.pu.toLocaleString()}</div>
            <div className="bo-stat-label">PU WAITING</div>
          </div>
          <div className="bo-stat">
            <div className="bo-stat-val" style={{ color: "#f0ebe3" }}>{stats.total.toLocaleString()}</div>
            <div className="bo-stat-label">TOTAL ALL TIME</div>
          </div>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="bo-toolbar">
        <input
          className="bo-search"
          placeholder="SEARCH SKU, PRODUCT, OR EMAIL..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {/* Status filters */}
        {["all", "waiting", "notified_pending", "notified", "cancelled"].map(s => (
          <button key={s}
            className={`bo-filter ${statusFilter === s ? "active" : ""}`}
            onClick={() => setStatusFilter(s)}>
            {s === "notified_pending" ? "PENDING" : s.toUpperCase()}
          </button>
        ))}

        <div style={{ width: 1, height: 20, background: "#2a2828", margin: "0 2px" }}/>

        {/* Vendor filters */}
        {["all", "wps", "pu"].map(v => (
          <button key={v}
            className={`bo-filter ${vendorFilter === v ? "active" : ""}`}
            onClick={() => setVendorFilter(v)}>
            {v.toUpperCase()}
          </button>
        ))}

        <div style={{ width: 1, height: 20, background: "#2a2828", margin: "0 2px" }}/>

        {/* Source filters */}
        {["all", "pdp", "cart", "wishlist"].map(s => (
          <button key={s}
            className={`bo-filter ${sourceFilter === s ? "active" : ""}`}
            onClick={() => setSourceFilter(s)}>
            {s.toUpperCase()}
          </button>
        ))}

        <div className="bo-toolbar-right">
          <span className="bo-count">
            {loading ? "LOADING..." : `${total.toLocaleString()} RECORDS`}
          </span>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bo-body">
        {loading ? (
          <div className="bo-loading">
            <div className="spinner"/>
            LOADING BACKORDER QUEUE...
          </div>
        ) : rows.length === 0 ? (
          <div className="bo-empty">
            {statusFilter === "waiting"
              ? "✓ NO CUSTOMERS WAITING ON RESTOCK"
              : "NO RECORDS MATCH YOUR FILTERS"}
          </div>
        ) : (
          <>
            <div className="bo-table-wrap">
              <table className="bo-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>PRODUCT</th>
                    <th>EMAIL</th>
                    <th>VENDOR</th>
                    <th>SOURCE</th>
                    <th>STATUS</th>
                    <th>REQUESTED</th>
                    <th>NOTIFIED</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.id}>
                      <td className="sku-mono">{row.product_sku ?? "—"}</td>
                      <td>
                        <div className="product-name">
                          {row.product_name ?? "—"}
                        </div>
                      </td>
                      <td className="email-cell">{row.email ?? "—"}</td>
                      <td>
                        {row.vendor ? (
                          <span className={`vendor-pill ${row.vendor}`}>
                            {row.vendor.toUpperCase()}
                          </span>
                        ) : "—"}
                      </td>
                      <td>
                        {row.source ? (
                          <span className={`source-pill ${row.source}`}>
                            {row.source.toUpperCase()}
                          </span>
                        ) : "—"}
                      </td>
                      <td>
                        <span className={`status-pill ${row.status}`}>
                          {row.status === "notified_pending" ? "PENDING" : row.status?.toUpperCase()}
                        </span>
                      </td>
                      <td className="date-cell">{fmtDate(row.created_at)}</td>
                      <td className="date-cell">{fmtDate(row.notified_at)}</td>
                      <td>
                        {row.status === "waiting" && (
                          <button
                            className="cancel-btn"
                            disabled={cancelling === row.id}
                            onClick={() => handleCancel(row.id)}
                          >
                            {cancelling === row.id ? "..." : "CANCEL"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="bo-pagination">
                <span style={{
                  fontFamily: "'Share Tech Mono', monospace", fontSize: 9,
                  color: "#8a8784", letterSpacing: "0.1em",
                }}>
                  SHOWING {(page * PAGE_SIZE + 1).toLocaleString()}–
                  {Math.min((page + 1) * PAGE_SIZE, total).toLocaleString()} OF {total.toLocaleString()}
                </span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="page-btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← PREV</button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    const pg = Math.max(0, Math.min(page - 3, totalPages - 7)) + i;
                    return (
                      <button key={pg}
                        className={`page-btn ${pg === page ? "active" : ""}`}
                        onClick={() => setPage(pg)}>
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