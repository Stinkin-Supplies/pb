"use client";
// ============================================================
// app/admin/orders/page.jsx
// ============================================================
// WPS Purchase Order tracker — full admin dashboard.
//
// Panels:
//   1. Stats bar       — total orders, pending POs, shipped, errors
//   2. Submit PO       — manually trigger WPS PO for any order ID
//   3. Orders table    — filterable list with WPS status + tracking
//   4. Order detail    — expand any row to see full WPS PO detail
//   5. Live poll       — re-check tracking on any submitted order
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import NavBar from "@/components/NavBar";

// ── Styles (matches sync dashboard exactly) ───────────────────
const css = `
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  ::-webkit-scrollbar { width:4px; } ::-webkit-scrollbar-thumb { background:#e8621a; }
  @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes spin   { to { transform:rotate(360deg); } }
  @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:0.4} }
  @keyframes shimmer { 0%{background-position:-400px 0} 100%{background-position:400px 0} }

  .wrap  { background:#0a0909; min-height:100vh; color:#f0ebe3; font-family:var(--font-stencil),sans-serif; }
  .hdr   { background:#111010; border-bottom:1px solid #2a2828; padding:28px 24px; }
  .body  { max-width:1100px; margin:0 auto; padding:28px 24px; }

  .card  { background:#111010; border:1px solid #2a2828; border-radius:3px; margin-bottom:16px; overflow:hidden; animation:fadeUp 0.25s ease both; }
  .card-head { padding:14px 20px; border-bottom:1px solid #2a2828; display:flex; align-items:center; justify-content:space-between; gap:12px; }
  .card-title { font-family:var(--font-caesar),sans-serif; font-size:20px; letter-spacing:0.05em; }
  .card-title span { color:#e8621a; }
  .card-body { padding:20px; }

  /* Stats */
  .stat-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:10px; }
  .stat-box  { background:#0a0909; border:1px solid #2a2828; border-radius:2px; padding:14px 16px; }
  .stat-box.hl  { border-color:rgba(232,98,26,0.3);  background:rgba(232,98,26,0.04); }
  .stat-box.grn { border-color:rgba(34,197,94,0.25); background:rgba(34,197,94,0.04); }
  .stat-box.red { border-color:rgba(185,28,28,0.25); background:rgba(185,28,28,0.04); }
  .stat-box.yel { border-color:rgba(201,168,76,0.25);background:rgba(201,168,76,0.04); }
  .stat-val   { font-family:var(--font-caesar),sans-serif; font-size:30px; letter-spacing:0.04em; line-height:1; margin-bottom:4px; }
  .stat-label { font-family:var(--font-stencil),monospace; font-size:8px; color:#8a8784; letter-spacing:0.12em; }

  /* Filters */
  .filter-row { display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-bottom:16px; }
  .filter-btn { font-family:var(--font-stencil),monospace; font-size:9px; letter-spacing:0.1em; padding:6px 14px; border-radius:2px; cursor:pointer; border:1px solid #2a2828; background:transparent; color:#8a8784; transition:all 0.15s; white-space:nowrap; }
  .filter-btn:hover  { color:#f0ebe3; border-color:#4a4848; }
  .filter-btn.active { background:rgba(232,98,26,0.1); border-color:rgba(232,98,26,0.35); color:#e8621a; }
  .search-input { font-family:var(--font-stencil),monospace; font-size:10px; background:#0a0909; border:1px solid #2a2828; color:#f0ebe3; padding:6px 12px; border-radius:2px; width:220px; letter-spacing:0.06em; outline:none; }
  .search-input::placeholder { color:#3a3838; }
  .search-input:focus { border-color:#4a4848; }

  /* Table */
  .tbl { width:100%; border-collapse:collapse; }
  .tbl th { font-family:var(--font-stencil),monospace; font-size:8px; color:#8a8784; letter-spacing:0.12em; padding:8px 14px; text-align:left; border-bottom:1px solid #2a2828; white-space:nowrap; }
  .tbl td { padding:11px 14px; border-bottom:1px solid #1a1919; font-size:13px; }
  .tbl tr:last-child td { border-bottom:none; }
  .tbl tr.expandable { cursor:pointer; transition:background 0.1s; }
  .tbl tr.expandable:hover td { background:rgba(255,255,255,0.02); }
  .tbl tr.expanded td { background:rgba(232,98,26,0.03); border-bottom:none; }

  /* Expanded detail row */
  .detail-row td { padding:0; background:#0a0909; border-bottom:1px solid #2a2828; }
  .detail-inner { padding:16px 20px; display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
  .detail-field { display:flex; flex-direction:column; gap:4px; }
  .detail-key   { font-family:var(--font-stencil),monospace; font-size:8px; color:#8a8784; letter-spacing:0.12em; }
  .detail-val   { font-size:13px; font-weight:500; color:#f0ebe3; word-break:break-all; }
  .detail-val.orange { color:#e8621a; }
  .detail-val.green  { color:#22c55e; }
  .detail-val.red    { color:#ef4444; }
  .detail-val.muted  { color:#8a8784; }

  /* Badges */
  .badge { font-family:var(--font-stencil),monospace; font-size:8px; letter-spacing:0.08em; padding:2px 8px; border-radius:1px; white-space:nowrap; }
  .badge-submitted  { background:rgba(59,130,246,0.1);  color:#60a5fa; border:1px solid rgba(59,130,246,0.2); }
  .badge-shipped    { background:rgba(34,197,94,0.1);   color:#22c55e; border:1px solid rgba(34,197,94,0.2); }
  .badge-pending    { background:rgba(201,168,76,0.1);  color:#c9a84c; border:1px solid rgba(201,168,76,0.2); }
  .badge-failed     { background:rgba(185,28,28,0.1);   color:#ef4444; border:1px solid rgba(185,28,28,0.2); }
  .badge-none       { background:rgba(42,40,40,0.5);    color:#8a8784; border:1px solid #2a2828; }
  .badge-processing { background:rgba(232,98,26,0.1);   color:#e8621a; border:1px solid rgba(232,98,26,0.2); }

  /* Buttons */
  .btn-primary { background:#e8621a; border:none; color:#0a0909; font-family:var(--font-caesar),sans-serif; font-size:17px; letter-spacing:0.1em; padding:11px 28px; border-radius:2px; cursor:pointer; transition:all 0.2s; white-space:nowrap; }
  .btn-primary:hover:not(:disabled) { background:#c94f0f; transform:translateY(-1px); }
  .btn-primary:disabled { opacity:0.35; cursor:not-allowed; transform:none; }
  .btn-ghost  { background:transparent; border:1px solid #2a2828; color:#8a8784; font-family:var(--font-stencil),monospace; font-size:9px; letter-spacing:0.1em; padding:5px 12px; border-radius:2px; cursor:pointer; transition:all 0.15s; white-space:nowrap; }
  .btn-ghost:hover:not(:disabled) { color:#f0ebe3; border-color:#4a4848; }
  .btn-ghost:disabled { opacity:0.35; cursor:not-allowed; }
  .btn-danger { background:transparent; border:1px solid rgba(185,28,28,0.35); color:#ef4444; font-family:var(--font-stencil),monospace; font-size:9px; letter-spacing:0.1em; padding:5px 12px; border-radius:2px; cursor:pointer; transition:all 0.15s; }
  .btn-danger:hover { background:rgba(185,28,28,0.08); }

  /* Text input */
  .text-input { font-family:var(--font-stencil),monospace; font-size:11px; background:#0a0909; border:1px solid #2a2828; color:#f0ebe3; padding:9px 14px; border-radius:2px; outline:none; letter-spacing:0.06em; transition:border-color 0.15s; }
  .text-input::placeholder { color:#3a3838; }
  .text-input:focus { border-color:rgba(232,98,26,0.4); }

  /* Live log */
  .live-log { background:#0a0909; border:1px solid #2a2828; border-radius:2px; padding:12px 14px; font-family:var(--font-stencil),monospace; font-size:10px; color:#8a8784; letter-spacing:0.06em; line-height:1.9; max-height:180px; overflow-y:auto; }
  .log-success { color:#22c55e; }
  .log-error   { color:#ef4444; }
  .log-warn    { color:#c9a84c; }
  .log-info    { color:#8a8784; }

  /* Spinner */
  .spinner { width:13px; height:13px; border-radius:50%; border:2px solid rgba(10,9,9,0.3); border-top-color:#0a0909; animation:spin 0.7s linear infinite; display:inline-block; vertical-align:middle; margin-right:7px; }
  .spinner-sm { width:11px; height:11px; border-radius:50%; border:2px solid rgba(255,255,255,0.1); border-top-color:#e8621a; animation:spin 0.7s linear infinite; display:inline-block; vertical-align:middle; }

  /* Skeleton shimmer */
  .skeleton { border-radius:2px; background:linear-gradient(90deg,#1a1919 25%,#222121 50%,#1a1919 75%); background-size:400px 100%; animation:shimmer 1.4s infinite; }

  /* Empty state */
  .empty { padding:48px 20px; text-align:center; }

  /* Info / warn banners */
  .banner-warn { background:rgba(201,168,76,0.06); border:1px solid rgba(201,168,76,0.2); border-radius:2px; padding:11px 16px; display:flex; gap:10px; align-items:flex-start; }
  .banner-info { background:rgba(59,130,246,0.05); border:1px solid rgba(59,130,246,0.15); border-radius:2px; padding:11px 16px; display:flex; gap:10px; align-items:flex-start; }

  /* Pagination */
  .pagination { display:flex; align-items:center; gap:8px; padding:14px 20px; border-top:1px solid #1a1919; }

  @media (max-width:800px) {
    .stat-grid   { grid-template-columns:repeat(3,1fr); }
    .detail-inner{ grid-template-columns:1fr 1fr; }
  }
  @media (max-width:560px) {
    .stat-grid   { grid-template-columns:1fr 1fr; }
    .detail-inner{ grid-template-columns:1fr; }
  }
`;

// ── Constants ─────────────────────────────────────────────────
const SYNC_SECRET  = process.env.NEXT_PUBLIC_SYNC_SECRET ?? "";
const PAGE_SIZE    = 25;

const STATUS_FILTERS = [
  { key: "all",        label: "ALL ORDERS" },
  { key: "pending",    label: "PENDING PO" },
  { key: "submitted",  label: "SUBMITTED" },
  { key: "processing", label: "PROCESSING" },
  { key: "shipped",    label: "SHIPPED" },
  { key: "po_failed",  label: "FAILED" },
  { key: "none",       label: "NO WPS ITEMS" },
];

// ── Helpers ───────────────────────────────────────────────────
const B  = (s) => ({ fontFamily:"var(--font-caesar),sans-serif",     ...s });
const M  = (s) => ({ fontFamily:"var(--font-stencil),monospace", ...s });
const fmt = (d) => d ? new Date(d).toLocaleString() : "—";
const fmtDate = (d) => d ? new Date(d).toLocaleDateString() : "—";

function statusBadge(status) {
  if (!status) return <span className="badge badge-none">NO PO</span>;
  const map = {
    submitted:  "badge-submitted",
    processing: "badge-processing",
    shipped:    "badge-shipped",
    pending:    "badge-pending",
    po_failed:  "badge-failed",
  };
  return (
    <span className={`badge ${map[status] ?? "badge-none"}`}>
      {status.replace("_", " ").toUpperCase()}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function AdminOrdersPage() {
  // Data
  const [orders,      setOrders]      = useState([]);
  const [stats,       setStats]       = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [totalCount,  setTotalCount]  = useState(0);

  // UI state
  const [filter,      setFilter]      = useState("all");
  const [search,      setSearch]      = useState("");
  const [page,        setPage]        = useState(0);
  const [expanded,    setExpanded]    = useState(null); // order id

  // Manual PO submission
  const [poOrderId,   setPoOrderId]   = useState("");
  const [poStatus,    setPoStatus]    = useState("idle"); // idle|running|done|error
  const [poLogs,      setPoLogs]      = useState([]);

  // Per-row polling state: { [orderId]: "polling"|"done"|"error" }
  const [polling,     setPolling]     = useState({});

  const addPoLog = (msg, type = "info") =>
    setPoLogs(prev => [{ msg, type, ts: new Date().toLocaleTimeString() }, ...prev]);

  // ── Fetch orders ─────────────────────────────────────────────
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page:   String(page),
        size:   String(PAGE_SIZE),
        filter: filter,
      });
      if (search.trim()) params.set("search", search.trim());

      const res  = await fetch(`/api/admin/orders/wps?${params}`, {
        headers: { Authorization: `Bearer ${SYNC_SECRET}` },
      });
      const data = await res.json();

      setOrders(data.orders    ?? []);
      setStats(data.stats      ?? null);
      setTotalCount(data.total ?? 0);
    } catch (e) {
      console.error("Failed to fetch orders:", e);
    } finally {
      setLoading(false);
    }
  }, [filter, search, page]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Auto-refresh every 60s
  useEffect(() => {
    const iv = setInterval(fetchOrders, 60_000);
    return () => clearInterval(iv);
  }, [fetchOrders]);

  // Reset to page 0 on filter/search change
  useEffect(() => { setPage(0); }, [filter, search]);

  // ── Manual PO submit ─────────────────────────────────────────
  const submitPO = async () => {
    const id = poOrderId.trim();
    if (!id) return;
    setPoStatus("running");
    setPoLogs([]);
    addPoLog(`Submitting PO for order ${id}...`);

    try {
      const res  = await fetch("/api/vendors/wps/order", {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:  `Bearer ${SYNC_SECRET}`,
        },
        body: JSON.stringify({ orderId: id }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        addPoLog(`Failed: ${data.error ?? "Unknown error"}`, "error");
        setPoStatus("error");
        return;
      }

      if (data.message) {
        // "No WPS items" non-error case
        addPoLog(data.message, "warn");
        setPoStatus("done");
        return;
      }

      addPoLog(`✓ WPS order created: ${data.wpsOrderId}`, "success");
      addPoLog(`Status: ${data.status}`, "success");
      if (data.estimatedShipDate)
        addPoLog(`Est. ship: ${fmtDate(data.estimatedShipDate)}`, "info");
      addPoLog(`${data.itemCount} WPS line item(s) submitted`, "info");
      setPoStatus("done");
      setPoOrderId("");
      fetchOrders();
    } catch (e) {
      addPoLog(`Fatal: ${e?.message ?? "Network error"}`, "error");
      setPoStatus("error");
    }
  };

  // ── Poll tracking for one order ───────────────────────────────
  const pollTracking = async (orderId) => {
    setPolling(p => ({ ...p, [orderId]: "polling" }));
    try {
      const res  = await fetch(
        `/api/vendors/wps/order?orderId=${encodeURIComponent(orderId)}`,
        { headers: { Authorization: `Bearer ${SYNC_SECRET}` } }
      );
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? "Poll failed");

      // Update that specific order row in state
      setOrders(prev => prev.map(o =>
        o.id === orderId
          ? {
              ...o,
              wps_status:          data.status,
              wps_tracking_number: data.trackingNumber,
              wps_carrier:         data.carrier,
              wps_estimated_ship_date: data.estimatedShipDate,
            }
          : o
      ));
      setPolling(p => ({ ...p, [orderId]: "done" }));
    } catch (e) {
      console.error("Poll failed:", e.message);
      setPolling(p => ({ ...p, [orderId]: "error" }));
    }
  };

  // ── Derived UI ────────────────────────────────────────────────
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const isPoRunning = poStatus === "running";

  // ── Skeleton rows ─────────────────────────────────────────────
  const SkeletonRows = () => (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i}>
          {[140, 100, 90, 80, 110, 80, 100, 70].map((w, j) => (
            <td key={j} style={{padding:"13px 14px"}}>
              <div className="skeleton" style={{height:10, width:w, borderRadius:2}} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="wrap">
      <style>{css}</style>
      <NavBar activePage="admin" />

      {/* Header */}
      <div className="hdr">
        <div style={M({fontSize:9, color:"#e8621a", letterSpacing:"0.25em", marginBottom:6})}>ADMIN</div>
        <div style={B({fontSize:40, letterSpacing:"0.04em", lineHeight:1})}>
          WPS <span style={{color:"#e8621a"}}>ORDERS</span>
        </div>
        <div style={{fontSize:13, color:"#8a8784", marginTop:4}}>
          Purchase order tracker — WPS dropship status &amp; tracking
        </div>
      </div>

      <div className="body">

        {/* ── Stats ── */}
        <div className="card">
          <div className="card-body" style={{paddingBottom:18}}>
            <div className="stat-grid">
              <div className="stat-box hl">
                <div className="stat-val" style={{color:"#e8621a"}}>
                  {loading && !stats ? <div className="skeleton" style={{height:28, width:60}}/> : (stats?.total ?? "—").toLocaleString()}
                </div>
                <div className="stat-label">TOTAL ORDERS</div>
              </div>
              <div className="stat-box yel">
                <div className="stat-val" style={{color:"#c9a84c"}}>
                  {loading && !stats ? <div className="skeleton" style={{height:28, width:40}}/> : (stats?.pending ?? 0)}
                </div>
                <div className="stat-label">PENDING PO</div>
              </div>
              <div className="stat-box">
                <div className="stat-val" style={{color:"#60a5fa"}}>
                  {loading && !stats ? <div className="skeleton" style={{height:28, width:40}}/> : (stats?.submitted ?? 0)}
                </div>
                <div className="stat-label">SUBMITTED</div>
              </div>
              <div className="stat-box grn">
                <div className="stat-val" style={{color:"#22c55e"}}>
                  {loading && !stats ? <div className="skeleton" style={{height:28, width:40}}/> : (stats?.shipped ?? 0)}
                </div>
                <div className="stat-label">SHIPPED</div>
              </div>
              <div className="stat-box red">
                <div className="stat-val" style={{color:"#ef4444"}}>
                  {loading && !stats ? <div className="skeleton" style={{height:28, width:30}}/> : (stats?.failed ?? 0)}
                </div>
                <div className="stat-label">FAILED POs</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Manual PO submission ── */}
        <div className="card">
          <div className="card-head">
            <div className="card-title">SUBMIT <span>PO</span></div>
            <span style={M({fontSize:9, color:"#8a8784", letterSpacing:"0.1em"})}>
              MANUAL TRIGGER
            </span>
          </div>
          <div className="card-body">
            <div style={M({fontSize:9, color:"#8a8784", letterSpacing:"0.1em", marginBottom:12})}>
              ORDERS WITH WPS ITEMS ARE AUTO-SUBMITTED VIA STRIPE WEBHOOK. USE THIS TO RETRY FAILURES OR SUBMIT MANUALLY.
            </div>
            <div style={{display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", marginBottom: poLogs.length ? 14 : 0}}>
              <input
                className="text-input"
                style={{width:280}}
                placeholder="Order ID (e.g. ord_abc123...)"
                value={poOrderId}
                onChange={e => setPoOrderId(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !isPoRunning && submitPO()}
                disabled={isPoRunning}
              />
              <button
                className="btn-primary"
                onClick={submitPO}
                disabled={isPoRunning || !poOrderId.trim()}
              >
                {isPoRunning
                  ? <><span className="spinner"/>SUBMITTING...</>
                  : "SUBMIT TO WPS →"}
              </button>
              {poStatus === "done" && (
                <span style={M({fontSize:9, color:"#22c55e", letterSpacing:"0.12em"})}>
                  ✓ PO SUBMITTED
                </span>
              )}
              {poStatus === "error" && (
                <span style={M({fontSize:9, color:"#ef4444", letterSpacing:"0.12em"})}>
                  ✗ SUBMISSION FAILED
                </span>
              )}
            </div>

            {poLogs.length > 0 && (
              <div className="live-log">
                {poLogs.map((l, i) => (
                  <div key={i} className={`log-${l.type}`}>[{l.ts}] {l.msg}</div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Orders table ── */}
        <div className="card">
          <div className="card-head">
            <div className="card-title">ALL <span>ORDERS</span></div>
            <span style={M({fontSize:9, color:"#8a8784"})}>
              {loading ? "LOADING..." : `${totalCount.toLocaleString()} ORDERS`}
            </span>
          </div>
          <div className="card-body" style={{paddingBottom:0}}>

            {/* Filter + search */}
            <div className="filter-row">
              {STATUS_FILTERS.map(f => (
                <button
                  key={f.key}
                  className={`filter-btn ${filter === f.key ? "active" : ""}`}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                  {stats && f.key !== "all" && stats[f.key] !== undefined && (
                    <span style={{marginLeft:6, opacity:0.6}}>
                      {stats[f.key]}
                    </span>
                  )}
                </button>
              ))}
              <input
                className="search-input"
                placeholder="Search order ID, SKU, WPS #..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Table */}
          <div style={{overflowX:"auto"}}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>ORDER ID</th>
                  <th>PLACED</th>
                  <th>CUSTOMER</th>
                  <th>WPS STATUS</th>
                  <th>WPS ORDER #</th>
                  <th>TRACKING</th>
                  <th>EST. SHIP</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <SkeletonRows />
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="empty">
                        <div style={B({fontSize:28, color:"#2a2828", marginBottom:8})}>NO ORDERS</div>
                        <div style={M({fontSize:9, color:"#3a3838"})}>
                          {filter !== "all" ? "TRY A DIFFERENT FILTER" : "NO ORDERS FOUND"}
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  orders.map(order => {
                    const isExpanded = expanded === order.id;
                    const isPolling  = polling[order.id] === "polling";

                    return [
                      // Main row
                      <tr
                        key={order.id}
                        className={`expandable ${isExpanded ? "expanded" : ""}`}
                        onClick={() => setExpanded(isExpanded ? null : order.id)}
                      >
                        <td>
                          <span style={M({fontSize:10, color:"#e8621a"})}>
                            {order.id?.slice(0, 8)}…
                          </span>
                        </td>
                        <td style={M({fontSize:10, color:"#8a8784"})}>
                          {fmtDate(order.created_at)}
                        </td>
                        <td style={{fontSize:12, color:"#c2b9b0"}}>
                          {order.customer_email ?? "—"}
                        </td>
                        <td>{statusBadge(order.wps_status)}</td>
                        <td style={M({fontSize:10, color: order.wps_order_id ? "#f0ebe3" : "#3a3838"})}>
                          {order.wps_order_id ?? "—"}
                        </td>
                        <td>
                          {order.wps_tracking_number ? (
                            <a
                              href={trackingUrl(order.wps_carrier, order.wps_tracking_number)}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={M({fontSize:10, color:"#22c55e", textDecoration:"none"})}
                              onClick={e => e.stopPropagation()}
                            >
                              {order.wps_tracking_number}
                            </a>
                          ) : (
                            <span style={M({fontSize:10, color:"#3a3838"})}>—</span>
                          )}
                        </td>
                        <td style={M({fontSize:10, color:"#8a8784"})}>
                          {fmtDate(order.wps_estimated_ship_date)}
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          <div style={{display:"flex", gap:6}}>
                            {order.wps_order_id && (
                              <button
                                className="btn-ghost"
                                disabled={isPolling}
                                onClick={() => pollTracking(order.id)}
                              >
                                {isPolling
                                  ? <span className="spinner-sm"/>
                                  : "↻ TRACK"}
                              </button>
                            )}
                            {(order.wps_status === "po_failed" || !order.wps_order_id) &&
                              order.has_wps_items && (
                              <button
                                className="btn-danger"
                                onClick={() => {
                                  setPoOrderId(order.id);
                                  setPoLogs([]);
                                  setPoStatus("idle");
                                  document.querySelector(".text-input")?.focus();
                                  window.scrollTo({ top: 0, behavior: "smooth" });
                                }}
                              >
                                RETRY PO
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>,

                      // Expanded detail row
                      isExpanded && (
                        <tr key={`${order.id}-detail`} className="detail-row">
                          <td colSpan={8}>
                            <div className="detail-inner">
                              <div className="detail-field">
                                <span className="detail-key">FULL ORDER ID</span>
                                <span className="detail-val orange">{order.id}</span>
                              </div>
                              <div className="detail-field">
                                <span className="detail-key">STRIPE PAYMENT</span>
                                <span className="detail-val muted" style={{fontSize:11}}>
                                  {order.stripe_payment_intent_id ?? "—"}
                                </span>
                              </div>
                              <div className="detail-field">
                                <span className="detail-key">ORDER TOTAL</span>
                                <span className="detail-val">
                                  {order.total_amount
                                    ? `$${(order.total_amount / 100).toFixed(2)}`
                                    : "—"}
                                </span>
                              </div>
                              <div className="detail-field">
                                <span className="detail-key">WPS ORDER ID</span>
                                <span className="detail-val orange">
                                  {order.wps_order_id ?? "—"}
                                </span>
                              </div>
                              <div className="detail-field">
                                <span className="detail-key">PO SUBMITTED AT</span>
                                <span className="detail-val muted" style={{fontSize:11}}>
                                  {fmt(order.wps_po_submitted_at)}
                                </span>
                              </div>
                              <div className="detail-field">
                                <span className="detail-key">WPS STATUS</span>
                                <span className="detail-val">
                                  {statusBadge(order.wps_status)}
                                </span>
                              </div>
                              <div className="detail-field">
                                <span className="detail-key">CARRIER</span>
                                <span className="detail-val">{order.wps_carrier ?? "—"}</span>
                              </div>
                              <div className="detail-field">
                                <span className="detail-key">TRACKING NUMBER</span>
                                <span className="detail-val green">
                                  {order.wps_tracking_number
                                    ? (
                                      <a
                                        href={trackingUrl(order.wps_carrier, order.wps_tracking_number)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{color:"#22c55e"}}
                                      >
                                        {order.wps_tracking_number} ↗
                                      </a>
                                    )
                                    : "—"}
                                </span>
                              </div>
                              <div className="detail-field">
                                <span className="detail-key">EST. SHIP DATE</span>
                                <span className="detail-val">
                                  {fmtDate(order.wps_estimated_ship_date)}
                                </span>
                              </div>
                              <div className="detail-field">
                                <span className="detail-key">SHIP TO</span>
                                <span className="detail-val muted" style={{fontSize:11, lineHeight:1.5}}>
                                  {[
                                    order.shipping_name,
                                    order.shipping_address_line1,
                                    order.shipping_city && `${order.shipping_city}, ${order.shipping_state} ${order.shipping_postal_code}`,
                                  ].filter(Boolean).join(" · ") || "—"}
                                </span>
                              </div>
                              {order.wps_error_message && (
                                <div className="detail-field" style={{gridColumn:"1/-1"}}>
                                  <span className="detail-key">ERROR</span>
                                  <span className="detail-val red" style={{fontSize:11}}>
                                    {order.wps_error_message}
                                  </span>
                                </div>
                              )}
                              {/* WPS line items */}
                              {order.wps_items?.length > 0 && (
                                <div className="detail-field" style={{gridColumn:"1/-1"}}>
                                  <span className="detail-key" style={{marginBottom:8}}>WPS LINE ITEMS</span>
                                  <div style={{display:"flex", flexDirection:"column", gap:6}}>
                                    {order.wps_items.map((item, i) => (
                                      <div key={i} style={{
                                        display:"flex", gap:16, alignItems:"center",
                                        background:"#111010", padding:"8px 12px",
                                        borderRadius:2, border:"1px solid #2a2828",
                                      }}>
                                        <span style={M({fontSize:10, color:"#e8621a"})}>{item.sku}</span>
                                        <span style={{fontSize:12, color:"#c2b9b0", flex:1}}>{item.name ?? ""}</span>
                                        <span style={M({fontSize:10, color:"#8a8784"})}>QTY: {item.quantity}</span>
                                        <span style={M({fontSize:10, color:"#f0ebe3"})}>
                                          ${item.unit_price?.toFixed(2) ?? "—"}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ),
                    ];
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="btn-ghost"
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
              >
                ← PREV
              </button>
              <span style={M({fontSize:9, color:"#8a8784", letterSpacing:"0.1em", margin:"0 8px"})}>
                PAGE {page + 1} / {totalPages}
              </span>
              <button
                className="btn-ghost"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
              >
                NEXT →
              </button>
              <span style={M({fontSize:9, color:"#3a3838", letterSpacing:"0.08em", marginLeft:"auto"})}>
                {totalCount.toLocaleString()} TOTAL
              </span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ── Tracking URL builder ──────────────────────────────────────
function trackingUrl(carrier, trackingNumber) {
  if (!carrier || !trackingNumber) return "#";
  const c = carrier.toLowerCase();
  if (c.includes("ups"))   return `https://www.ups.com/track?tracknum=${trackingNumber}`;
  if (c.includes("fedex")) return `https://www.fedex.com/fedextrack/?tracknumbers=${trackingNumber}`;
  if (c.includes("usps"))  return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`;
  return `https://www.google.com/search?q=${encodeURIComponent(`${carrier} tracking ${trackingNumber}`)}`;
}