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
    background: #f5f0e8; min-height: 100vh;
    color: #1a1208; font-family: var(--font-stencil), sans-serif;
  }

  /* ── HEADER ── */
  .bo-header {
    background: #ffffff; border-bottom: 1px solid #ddd0b8;
    padding: 20px 32px; display: flex; align-items: center;
    justify-content: space-between; gap: 16px; flex-wrap: wrap;
  }
  .bo-title {
    font-family: var(--font-caesar), sans-serif;
    font-size: 28px; letter-spacing: 0.05em;
  }
  .bo-title span { color: #a3822c; }
  .bo-subtitle {
    font-family: var(--font-stencil), monospace;
    font-size: 9px; color: #7a6a4f; letter-spacing: 0.15em; margin-top: 2px;
  }

  /* ── STATS ── */
  .bo-stats {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 1px; background: #ddd0b8; border-bottom: 1px solid #ddd0b8;
  }
  .bo-stat {
    background: #ffffff; padding: 18px 24px;
  }
  .bo-stat-val {
    font-family: var(--font-caesar), sans-serif;
    font-size: 32px; line-height: 1; letter-spacing: 0.03em;
  }
  .bo-stat-val.orange { color: #a3822c; }
  .bo-stat-val.gold   { color: #a3822c; }
  .bo-stat-val.green  { color: #2f8552; }
  .bo-stat-val.grey   { color: #7a6a4f; }
  .bo-stat-label {
    font-family: var(--font-stencil), monospace;
    font-size: 8px; color: #7a6a4f; letter-spacing: 0.15em; margin-top: 4px;
  }

  /* ── TOOLBAR ── */
  .bo-toolbar {
    padding: 12px 32px; background: #f5f0e8;
    border-bottom: 1px solid #e6dcc0;
    display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
  }
  .bo-search {
    background: #fbf6ec; border: 1px solid #ddd0b8;
    color: #1a1208; padding: 8px 12px; border-radius: 2px;
    font-family: var(--font-stencil), monospace; font-size: 11px;
    letter-spacing: 0.06em; width: 260px; outline: none;
    transition: border-color 0.15s;
  }
  .bo-search:focus { border-color: #a3822c; }
  .bo-search::placeholder { color: #b8ab87; }
  .bo-filter {
    background: none; border: 1px solid #ddd0b8; color: #7a6a4f;
    padding: 7px 14px; border-radius: 2px; cursor: pointer;
    font-family: var(--font-stencil), monospace; font-size: 9px;
    letter-spacing: 0.1em; transition: all 0.15s;
  }
  .bo-filter:hover  { border-color: #a3822c; color: #a3822c; }
  .bo-filter.active { border-color: #a3822c; color: #a3822c; background: rgba(201,168,76,0.1); }
  .bo-toolbar-right { margin-left: auto; display: flex; gap: 8px; align-items: center; }
  .bo-count {
    font-family: var(--font-stencil), monospace;
    font-size: 9px; color: #7a6a4f; letter-spacing: 0.1em;
  }

  /* ── TABLE ── */
  .bo-body { padding: 24px 32px; }
  .bo-table-wrap { overflow-x: auto; }
  .bo-table {
    width: 100%; border-collapse: collapse; font-size: 13px;
  }
  .bo-table th {
    font-family: var(--font-stencil), monospace;
    font-size: 8px; color: #7a6a4f; letter-spacing: 0.15em;
    padding: 10px 14px; text-align: left;
    border-bottom: 1px solid #ddd0b8;
    background: #ffffff; white-space: nowrap;
  }
  .bo-table td {
    padding: 11px 14px; border-bottom: 1px solid #e6dcc0;
    vertical-align: middle;
  }
  .bo-table tr:hover td { background: rgba(201,168,76,0.05); }

  .sku-mono {
    font-family: var(--font-stencil), monospace;
    font-size: 10px; color: #7a6a4f; letter-spacing: 0.08em;
  }
  .product-name { font-weight: 600; color: #1a1208; }
  .product-name small {
    display: block; font-family: var(--font-stencil), monospace;
    font-size: 8px; color: #7a6a4f; letter-spacing: 0.1em;
    font-weight: 400; margin-top: 2px;
  }
  .email-cell {
    font-family: var(--font-stencil), monospace;
    font-size: 10px; color: #5a4d38; letter-spacing: 0.04em;
  }
  .date-cell {
    font-family: var(--font-stencil), monospace;
    font-size: 9px; color: #7a6a4f; letter-spacing: 0.06em;
    white-space: nowrap;
  }

  .source-pill {
    display: inline-block;
    font-family: var(--font-stencil), monospace; font-size: 8px;
    letter-spacing: 0.1em; padding: 3px 8px; border-radius: 1px; border: 1px solid;
  }
  .source-pill.pdp      { color: #3b78d8; border-color: rgba(59,120,216,0.3);  background: rgba(59,120,216,0.08); }
  .source-pill.cart     { color: #a3822c; border-color: rgba(201,168,76,0.3);   background: rgba(201,168,76,0.08); }
  .source-pill.wishlist { color: #a3822c; border-color: rgba(201,168,76,0.35);  background: rgba(201,168,76,0.08); }

  .status-pill {
    display: inline-block;
    font-family: var(--font-stencil), monospace; font-size: 8px;
    letter-spacing: 0.1em; padding: 3px 8px; border-radius: 1px; border: 1px solid;
  }
  .status-pill.waiting          { color: #9a5a0c; border-color: rgba(154,90,12,0.35);  background: rgba(154,90,12,0.08); }
  .status-pill.notified_pending { color: #3b78d8; border-color: rgba(59,120,216,0.3);  background: rgba(59,120,216,0.08); }
  .status-pill.notified         { color: #2f8552; border-color: rgba(47,133,82,0.3);   background: rgba(47,133,82,0.08); }
  .status-pill.cancelled        { color: #7a6a4f; border-color: #ddd0b8;               background: #fbf6ec; }

  .vendor-pill {
    display: inline-block;
    font-family: var(--font-stencil), monospace; font-size: 8px;
    letter-spacing: 0.12em; padding: 3px 8px; border-radius: 1px; border: 1px solid;
  }
  .vendor-pill.wps { color: #3b78d8; border-color: rgba(59,120,216,0.3); background: rgba(59,120,216,0.08); }
  .vendor-pill.pu  { color: #a3822c; border-color: rgba(201,168,76,0.35); background: rgba(201,168,76,0.08); }

  .cancel-btn {
    background: none; border: 1px solid #ddd0b8; color: #7a6a4f;
    font-family: var(--font-stencil), monospace; font-size: 8px;
    letter-spacing: 0.1em; padding: 4px 10px; border-radius: 2px;
    cursor: pointer; transition: all 0.15s;
  }
  .cancel-btn:hover { border-color: #c0392b; color: #c0392b; }

  /* ── EMPTY / LOADING ── */
  .bo-empty {
    text-align: center; padding: 80px 20px;
    font-family: var(--font-stencil), monospace;
    font-size: 10px; color: #b8ab87; letter-spacing: 0.15em;
  }
  .bo-loading {
    display: flex; align-items: center; justify-content: center;
    padding: 80px; gap: 12px;
    font-family: var(--font-stencil), monospace;
    font-size: 9px; color: #7a6a4f; letter-spacing: 0.12em;
  }
  .spinner {
    width: 18px; height: 18px; border-radius: 50%;
    border: 2px solid #ddd0b8; border-top-color: #a3822c;
    animation: spin 0.6s linear infinite; flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── PAGINATION ── */
  .bo-pagination {
    display: flex; align-items: center; justify-content: space-between;
    padding: 20px 0; margin-top: 8px;
    border-top: 1px solid #ddd0b8; flex-wrap: wrap; gap: 12px;
  }
  .page-btn {
    font-family: var(--font-stencil), monospace; font-size: 9px;
    letter-spacing: 0.08em; background: #ffffff;
    border: 1px solid #ddd0b8; color: #7a6a4f;
    padding: 6px 12px; border-radius: 2px; cursor: pointer; transition: all 0.15s;
  }
  .page-btn:hover:not(:disabled) { border-color: #a3822c; color: #a3822c; }
  .page-btn.active { background: #c9a84c; border-color: #c9a84c; color: #1a1208; }
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
            background: "none", border: "1px solid #ddd0b8", color: "#7a6a4f",
            fontFamily: "var(--font-stencil), monospace", fontSize: 9,
            letterSpacing: "0.12em", padding: "8px 16px", borderRadius: 2,
            cursor: "pointer", transition: "all 0.15s",
          }}
          onMouseOver={e => { e.target.style.borderColor = "#a3822c"; e.target.style.color = "#a3822c"; }}
          onMouseOut={e =>  { e.target.style.borderColor = "#ddd0b8"; e.target.style.color = "#7a6a4f"; }}
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
            <div className="bo-stat-val" style={{ color: "#3b78d8" }}>{stats.notified_pending.toLocaleString()}</div>
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
            <div className="bo-stat-val" style={{ color: "#3b78d8" }}>{stats.wps.toLocaleString()}</div>
            <div className="bo-stat-label">WPS WAITING</div>
          </div>
          <div className="bo-stat">
            <div className="bo-stat-val gold">{stats.pu.toLocaleString()}</div>
            <div className="bo-stat-label">PU WAITING</div>
          </div>
          <div className="bo-stat">
            <div className="bo-stat-val" style={{ color: "#1a1208" }}>{stats.total.toLocaleString()}</div>
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

        <div style={{ width: 1, height: 20, background: "#ddd0b8", margin: "0 2px" }}/>

        {/* Vendor filters */}
        {["all", "wps", "pu"].map(v => (
          <button key={v}
            className={`bo-filter ${vendorFilter === v ? "active" : ""}`}
            onClick={() => setVendorFilter(v)}>
            {v.toUpperCase()}
          </button>
        ))}

        <div style={{ width: 1, height: 20, background: "#ddd0b8", margin: "0 2px" }}/>

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
                  fontFamily: "var(--font-stencil), monospace", fontSize: 9,
                  color: "#7a6a4f", letterSpacing: "0.1em",
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