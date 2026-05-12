"use client";
// ============================================================
// app/admin/fitment/page.jsx
// Fitment + OEM Editor
// — Browse products with fitment/OEM data
// — Edit OEM numbers per product
// — Add/remove fitment rows per product
// — Reports: missing fitment, missing OEM, flag mismatches
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";

const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --black:  #0a0909; --coal:   #111010; --iron:  #1a1919;
    --steel:  #2a2828; --chrome: #8a8784; --cream: #f0ebe3;
    --orange: #e8621a; --gold:   #c9a84c; --red:   #b91c1c;
    --green:  #22c55e; --blue:   #3b82f6;
  }

  .fm-wrap { background: var(--black); min-height: 100vh; color: var(--cream); font-family: var(--font-stencil), monospace; }

  /* HEADER */
  .fm-header { background: var(--coal); border-bottom: 1px solid var(--steel); padding: 20px 28px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .fm-title { font-family: var(--font-caesar), sans-serif; font-size: 28px; letter-spacing: 0.05em; line-height: 1; }
  .fm-title span { color: var(--orange); }
  .fm-subtitle { font-size: 9px; color: var(--chrome); letter-spacing: 0.18em; margin-top: 4px; }

  /* STAT BAR */
  .fm-stats { display: flex; gap: 1px; background: var(--steel); border-bottom: 1px solid var(--steel); }
  .fm-stat { flex: 1; background: var(--coal); padding: 14px 20px; cursor: pointer; transition: background 0.15s; }
  .fm-stat:hover { background: #161515; }
  .fm-stat.active { background: rgba(232,98,26,0.08); border-bottom: 2px solid var(--orange); }
  .fm-stat-val { font-family: var(--font-caesar), sans-serif; font-size: 28px; letter-spacing: 0.04em; line-height: 1; }
  .fm-stat-val.orange { color: var(--orange); }
  .fm-stat-val.red { color: #ff7a7a; }
  .fm-stat-val.green { color: var(--green); }
  .fm-stat-val.gold { color: var(--gold); }
  .fm-stat-label { font-size: 8px; color: var(--chrome); letter-spacing: 0.16em; margin-top: 3px; }

  /* TABS */
  .fm-tabs { display: flex; gap: 1px; background: var(--steel); border-bottom: 1px solid var(--steel); }
  .fm-tab { padding: 10px 20px; font-size: 9px; letter-spacing: 0.16em; color: var(--chrome); cursor: pointer; background: var(--coal); border-bottom: 2px solid transparent; transition: all 0.15s; user-select: none; }
  .fm-tab:hover { color: var(--cream); }
  .fm-tab.active { color: var(--orange); border-bottom-color: var(--orange); background: rgba(232,98,26,0.05); }

  /* TOOLBAR */
  .fm-toolbar { padding: 12px 28px; background: var(--black); border-bottom: 1px solid var(--iron); display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .fm-input { background: var(--iron); border: 1px solid var(--steel); color: var(--cream); padding: 7px 12px; border-radius: 2px; font-family: var(--font-stencil), monospace; font-size: 11px; letter-spacing: 0.06em; outline: none; transition: border-color 0.15s; }
  .fm-input:focus { border-color: var(--orange); }
  .fm-input::placeholder { color: var(--chrome); }
  .fm-input.search { width: 280px; }
  .fm-select { background: var(--iron); border: 1px solid var(--steel); color: var(--cream); padding: 7px 10px; border-radius: 2px; font-family: var(--font-stencil), monospace; font-size: 10px; letter-spacing: 0.06em; outline: none; cursor: pointer; }
  .fm-select:focus { border-color: var(--orange); }

  /* BUTTONS */
  .btn { font-family: var(--font-stencil), monospace; font-size: 9px; letter-spacing: 0.14em; padding: 8px 16px; border-radius: 2px; border: 1px solid; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
  .btn-ghost { background: none; border-color: var(--steel); color: var(--chrome); }
  .btn-ghost:hover { border-color: var(--orange); color: var(--orange); }
  .btn-primary { background: var(--orange); border-color: var(--orange); color: var(--black); font-weight: 700; }
  .btn-primary:hover { background: #c94f0f; }
  .btn-sm { padding: 4px 10px; font-size: 8px; }
  .btn-danger { background: none; border-color: rgba(185,28,28,0.4); color: #ff7a7a; }
  .btn-danger:hover { background: rgba(185,28,28,0.08); border-color: #ff7a7a; }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }

  /* TABLE */
  .fm-table-wrap { overflow-x: auto; min-height: 300px; }
  .fm-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .fm-table th { background: var(--coal); border-bottom: 1px solid var(--steel); padding: 10px 14px; text-align: left; font-size: 8px; color: var(--chrome); letter-spacing: 0.18em; font-weight: normal; white-space: nowrap; }
  .fm-table td { padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.03); vertical-align: middle; white-space: nowrap; }
  .fm-table tr:hover td { background: rgba(255,255,255,0.015); }

  .cell-name { font-size: 12px; color: var(--cream); max-width: 260px; overflow: hidden; text-overflow: ellipsis; display: block; }
  .cell-sku { font-family: var(--font-stencil), monospace; font-size: 9px; color: #555; margin-top: 2px; display: block; }
  .cell-brand { font-size: 11px; color: var(--chrome); }

  .badge { display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--steel); border-radius: 2px; padding: 2px 7px; font-size: 9px; letter-spacing: 0.1em; color: var(--chrome); }
  .badge-ok { border-color: rgba(34,197,94,0.35); color: var(--green); }
  .badge-warn { border-color: rgba(245,158,11,0.35); color: #f59e0b; }
  .badge-none { border-color: rgba(255,90,90,0.25); color: #ff7a7a; }
  .badge-gold { border-color: rgba(201,168,76,0.35); color: var(--gold); }

  .edit-btn { background: none; border: 1px solid var(--steel); border-radius: 2px; color: var(--chrome); font-family: var(--font-stencil), monospace; font-size: 8px; letter-spacing: 0.1em; padding: 4px 10px; cursor: pointer; transition: all 0.15s; }
  .edit-btn:hover { border-color: var(--orange); color: var(--orange); }

  /* PAGINATION */
  .fm-pagination { display: flex; align-items: center; justify-content: space-between; padding: 12px 28px; border-top: 1px solid var(--iron); background: var(--black); flex-wrap: wrap; gap: 10px; }
  .page-info { font-size: 9px; color: var(--chrome); letter-spacing: 0.12em; }
  .page-info strong { color: var(--cream); }
  .page-btns { display: flex; gap: 4px; }
  .page-btn { background: none; border: 1px solid var(--steel); color: var(--chrome); padding: 5px 10px; border-radius: 2px; font-family: var(--font-stencil), monospace; font-size: 9px; letter-spacing: 0.1em; cursor: pointer; transition: all 0.15s; }
  .page-btn:hover:not(:disabled) { border-color: var(--orange); color: var(--orange); }
  .page-btn.active { background: var(--orange); border-color: var(--orange); color: var(--black); }
  .page-btn:disabled { opacity: 0.3; cursor: default; }

  /* EMPTY / LOADING */
  .fm-empty { text-align: center; padding: 60px 20px; font-size: 9px; color: #3a3838; letter-spacing: 0.2em; }
  .fm-loading { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 60px; color: var(--chrome); font-size: 9px; letter-spacing: 0.18em; }
  .spinner { width: 16px; height: 16px; border: 2px solid var(--steel); border-top-color: var(--orange); border-radius: 50%; animation: spin 0.6s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* MODAL */
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.75); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 24px; backdrop-filter: blur(4px); animation: fadeIn 0.2s ease; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  .modal { background: var(--coal); border: 1px solid var(--steel); width: 100%; max-width: 640px; max-height: 85vh; display: flex; flex-direction: column; animation: slideUp 0.22s cubic-bezier(0.22,1,0.36,1); }
  @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  .modal-wide { max-width: 800px; }
  .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 24px 14px; border-bottom: 1px solid var(--steel); flex-shrink: 0; }
  .modal-title { font-family: var(--font-caesar), sans-serif; font-size: 20px; letter-spacing: 0.06em; }
  .modal-title span { color: var(--orange); }
  .modal-subtitle { font-size: 9px; color: var(--chrome); letter-spacing: 0.14em; margin-top: 2px; }
  .modal-close { background: none; border: 1px solid var(--steel); color: var(--chrome); width: 28px; height: 28px; border-radius: 2px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
  .modal-close:hover { border-color: var(--orange); color: var(--orange); }
  .modal-body { flex: 1; overflow-y: auto; padding: 20px 24px; }
  .modal-body::-webkit-scrollbar { width: 4px; }
  .modal-body::-webkit-scrollbar-thumb { background: var(--orange); }
  .modal-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 24px; border-top: 1px solid var(--steel); flex-shrink: 0; }

  /* MODAL SECTIONS */
  .modal-section { margin-bottom: 24px; }
  .modal-section-title { font-size: 9px; color: var(--orange); letter-spacing: 0.2em; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid var(--iron); }

  /* OEM LIST */
  .oem-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
  .oem-row { display: flex; align-items: center; gap: 10px; background: var(--iron); border: 1px solid var(--steel); padding: 8px 12px; border-radius: 2px; }
  .oem-number { font-family: var(--font-caesar), sans-serif; font-size: 16px; letter-spacing: 0.06em; color: var(--orange); flex: 1; }
  .oem-mfr { font-size: 10px; color: var(--chrome); }
  .oem-source { font-size: 9px; color: #444; letter-spacing: 0.08em; }

  /* FITMENT LIST */
  .fitment-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; max-height: 260px; overflow-y: auto; }
  .fitment-row { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border: 1px solid var(--steel); border-radius: 2px; font-size: 11px; }
  .fitment-row:nth-child(odd) { background: rgba(255,255,255,0.01); }
  .fit-family { font-size: 9px; color: var(--gold); letter-spacing: 0.1em; width: 80px; flex-shrink: 0; }
  .fit-model { flex: 1; color: var(--cream); }
  .fit-code { font-family: var(--font-stencil), monospace; font-size: 9px; color: var(--chrome); width: 70px; }
  .fit-year { font-family: var(--font-caesar), sans-serif; font-size: 14px; color: var(--orange); width: 48px; text-align: right; }

  /* ADD FORM */
  .add-form { display: grid; gap: 10px; }
  .add-form-row { display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 8px; align-items: end; }
  .form-label { font-size: 8px; color: var(--chrome); letter-spacing: 0.14em; margin-bottom: 4px; display: block; }
  .form-input { background: var(--iron); border: 1px solid var(--steel); color: var(--cream); padding: 7px 10px; border-radius: 2px; font-family: var(--font-stencil), monospace; font-size: 11px; outline: none; width: 100%; transition: border-color 0.15s; }
  .form-input:focus { border-color: var(--orange); }
  .form-select { background: var(--iron); border: 1px solid var(--steel); color: var(--cream); padding: 7px 10px; border-radius: 2px; font-family: var(--font-stencil), monospace; font-size: 10px; outline: none; cursor: pointer; width: 100%; }

  /* REPORT TABS */
  .report-section { padding: 20px 28px; }
  .report-title { font-family: var(--font-caesar), sans-serif; font-size: 18px; letter-spacing: 0.05em; margin-bottom: 4px; }
  .report-sub { font-size: 9px; color: var(--chrome); letter-spacing: 0.14em; margin-bottom: 16px; }
  .report-card { background: var(--coal); border: 1px solid var(--steel); border-radius: 2px; overflow: hidden; margin-bottom: 16px; }
  .report-card-header { padding: 12px 16px; border-bottom: 1px solid var(--steel); display: flex; align-items: center; justify-content: space-between; }
  .report-card-title { font-size: 9px; color: var(--orange); letter-spacing: 0.16em; }
  .report-card-count { font-family: var(--font-caesar), sans-serif; font-size: 20px; color: var(--cream); }

  /* TOAST */
  .toast { position: fixed; bottom: 24px; right: 24px; background: var(--coal); border: 1px solid var(--steel); padding: 12px 20px; font-size: 10px; letter-spacing: 0.12em; z-index: 300; animation: toastIn 0.2s ease; border-radius: 2px; }
  .toast.success { border-color: rgba(34,197,94,0.4); color: var(--green); }
  .toast.error { border-color: rgba(185,28,28,0.4); color: #ff7a7a; }
  @keyframes toastIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

  .modal-error { background: rgba(185,28,28,0.1); border: 1px solid rgba(185,28,28,0.3); color: #ff7a7a; padding: 8px 12px; font-size: 10px; letter-spacing: 0.1em; border-radius: 2px; margin-bottom: 14px; }
`;

const TABS = ["PRODUCTS", "REPORTS"];
const FAMILIES = ["Softail","Touring","Dyna","Sportster","FX","FL","Vintage","Street","CVO"];
const LIMIT_OPTIONS = [25, 50, 100];

// ── Helpers ───────────────────────────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState(null);
  const show = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);
  return [toast, show];
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AdminFitmentPage() {
  const [tab, setTab]           = useState("PRODUCTS");
  const [products, setProducts] = useState([]);
  const [stats, setStats]       = useState({ total: 0, withFitment: 0, withOem: 0, missingBoth: 0 });
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(false);
  const [page, setPage]         = useState(0);
  const [limit, setLimit]       = useState(50);
  const [search, setSearch]     = useState("");
  const [filterFamily, setFilterFamily] = useState("");
  const [filterMissing, setFilterMissing] = useState(""); // "fitment"|"oem"|"both"|""
  const [editProduct, setEditProduct] = useState(null);
  const [toast, showToast]      = useToast();
  const searchRef               = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page:    String(page),
        limit:   String(limit),
        ...(search        && { q:       search }),
        ...(filterFamily  && { family:  filterFamily }),
        ...(filterMissing && { missing: filterMissing }),
      });
      const res  = await fetch(`/api/admin/fitment?${params}`);
      const data = await res.json();
      setProducts(data.products ?? []);
      setTotal(data.total ?? 0);
      setStats(data.stats ?? { total: 0, withFitment: 0, withOem: 0, missingBoth: 0 });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, filterFamily, filterMissing]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  function pageNumbers() {
    const pages = [];
    const start = Math.max(0, page - 2);
    const end   = Math.min(totalPages - 1, page + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  const startRow = page * limit + 1;
  const endRow   = Math.min((page + 1) * limit, total);

  return (
    <div className="fm-wrap">
      <style>{css}</style>

      {/* HEADER */}
      <div className="fm-header">
        <div>
          <div className="fm-title">FITMENT <span>&</span> OEM</div>
          <div className="fm-subtitle">MANAGE VEHICLE FITMENT · OEM CROSS-REFERENCE · COVERAGE REPORTS</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button className="btn btn-ghost" onClick={fetchData}>↺ REFRESH</button>
        </div>
      </div>

      {/* STAT BAR */}
      <div className="fm-stats">
        <div className={`fm-stat ${filterMissing === "" ? "active" : ""}`} onClick={() => { setFilterMissing(""); setPage(0); }}>
          <div className="fm-stat-val">{stats.total.toLocaleString()}</div>
          <div className="fm-stat-label">TOTAL PRODUCTS</div>
        </div>
        <div className={`fm-stat ${filterMissing === "" ? "" : ""}`}>
          <div className="fm-stat-val green">{stats.withFitment.toLocaleString()}</div>
          <div className="fm-stat-label">HAVE FITMENT</div>
        </div>
        <div className={`fm-stat ${filterMissing === "" ? "" : ""}`}>
          <div className="fm-stat-val gold">{stats.withOem.toLocaleString()}</div>
          <div className="fm-stat-label">HAVE OEM #</div>
        </div>
        <div className={`fm-stat ${filterMissing === "fitment" ? "active" : ""}`} onClick={() => { setFilterMissing("fitment"); setPage(0); }}>
          <div className="fm-stat-val red">{(stats.total - stats.withFitment).toLocaleString()}</div>
          <div className="fm-stat-label">MISSING FITMENT ↗</div>
        </div>
        <div className={`fm-stat ${filterMissing === "oem" ? "active" : ""}`} onClick={() => { setFilterMissing("oem"); setPage(0); }}>
          <div className="fm-stat-val orange">{(stats.total - stats.withOem).toLocaleString()}</div>
          <div className="fm-stat-label">MISSING OEM # ↗</div>
        </div>
      </div>

      {/* TABS */}
      <div className="fm-tabs">
        {TABS.map(t => (
          <div key={t} className={`fm-tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t}
          </div>
        ))}
      </div>

      {tab === "PRODUCTS" && (
        <>
          {/* TOOLBAR */}
          <div className="fm-toolbar">
            <input
              ref={searchRef}
              className="fm-input search"
              placeholder="Search SKU, name, brand…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
            />
            <select className="fm-select" value={filterFamily} onChange={e => { setFilterFamily(e.target.value); setPage(0); }}>
              <option value="">ALL FAMILIES</option>
              {FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <select className="fm-select" value={filterMissing} onChange={e => { setFilterMissing(e.target.value); setPage(0); }}>
              <option value="">ALL PRODUCTS</option>
              <option value="fitment">MISSING FITMENT</option>
              <option value="oem">MISSING OEM #</option>
              <option value="both">MISSING BOTH</option>
            </select>
            <select className="fm-select" value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(0); }}>
              {LIMIT_OPTIONS.map(n => <option key={n} value={n}>{n} / PAGE</option>)}
            </select>
            {(search || filterFamily || filterMissing) && (
              <button className="btn btn-ghost" onClick={() => { setSearch(""); setFilterFamily(""); setFilterMissing(""); setPage(0); }}>
                ✕ CLEAR
              </button>
            )}
          </div>

          {/* TABLE */}
          <div className="fm-table-wrap">
            {loading ? (
              <div className="fm-loading"><div className="spinner" />LOADING…</div>
            ) : products.length === 0 ? (
              <div className="fm-empty">NO PRODUCTS FOUND</div>
            ) : (
              <table className="fm-table">
                <thead>
                  <tr>
                    <th style={{width:"28%"}}>PRODUCT</th>
                    <th style={{width:"11%"}}>BRAND</th>
                    <th style={{width:"8%"}}>VENDOR</th>
                    <th style={{width:"13%"}}>VENDOR PART #</th>
                    <th style={{width:"12%"}}>FITMENT</th>
                    <th style={{width:"14%"}}>OEM NUMBERS</th>
                    <th style={{width:"8%"}}>HD FLAG</th>
                    <th style={{width:"6%"}}></th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => (
                    <tr key={p.id}>
                      <td>
                        <span className="cell-name" title={p.name}>{p.name}</span>
                        <span className="cell-sku">{p.internal_sku ?? p.sku}</span>
                      </td>
                      <td><span className="cell-brand">{p.brand ?? "—"}</span></td>
                      <td>
                        <span className={`badge ${p.source_vendor === "PU" ? "badge-gold" : p.source_vendor === "WPS" ? "" : ""}`}>
                          {p.source_vendor ?? "—"}
                        </span>
                      </td>
                      <td>
                        <span style={{fontFamily:"var(--font-stencil),monospace", fontSize:10, color:"#8a8784", letterSpacing:"0.06em"}}>
                          {p.vendor_sku || p.brand_part_number || <span style={{color:"#333"}}>—</span>}
                        </span>
                      </td>
                      <td>
                        {p.fitment_count > 0
                          ? <span className="badge badge-ok">{p.fitment_count} ROWS</span>
                          : <span className="badge badge-none">NONE</span>
                        }
                      </td>
                      <td>
                        {p.oem_count > 0
                          ? <span className="badge badge-ok">{p.oem_count} OEM #</span>
                          : <span className="badge badge-none">NONE</span>
                        }
                      </td>
                      <td>
                        {p.is_harley_fitment
                          ? <span className="badge badge-gold">HD FIT</span>
                          : <span className="badge">—</span>
                        }
                      </td>
                      <td>
                        <button className="edit-btn" onClick={() => setEditProduct(p)}>
                          EDIT →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* PAGINATION */}
          {!loading && total > 0 && (
            <div className="fm-pagination">
              <div className="page-info">
                SHOWING <strong>{startRow.toLocaleString()}–{endRow.toLocaleString()}</strong> OF{" "}
                <strong>{total.toLocaleString()}</strong>
              </div>
              <div className="page-btns">
                <button className="page-btn" disabled={page === 0} onClick={() => setPage(0)}>««</button>
                <button className="page-btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹ PREV</button>
                {pageNumbers().map(n => (
                  <button key={n} className={`page-btn ${n === page ? "active" : ""}`} onClick={() => setPage(n)}>
                    {n + 1}
                  </button>
                ))}
                <button className="page-btn" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>NEXT ›</button>
                <button className="page-btn" disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>»»</button>
              </div>
            </div>
          )}
        </>
      )}

      {tab === "REPORTS" && (
        <ReportsTab stats={stats} />
      )}

      {/* EDIT MODAL */}
      {editProduct && (
        <ProductFitmentModal
          product={editProduct}
          onClose={() => setEditProduct(null)}
          onSaved={() => { fetchData(); showToast("Saved successfully"); }}
          showToast={showToast}
        />
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}

// ── Reports Tab ───────────────────────────────────────────────────────────────
function ReportsTab({ stats }) {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading]       = useState(false);

  async function runReport(type) {
    setLoading(true);
    try {
      const res  = await fetch(`/api/admin/fitment/report?type=${type}`);
      const data = await res.json();
      setReportData({ type, rows: data.rows ?? [] });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="report-section">
      <div className="report-title">Coverage Reports</div>
      <div className="report-sub">ANALYZE FITMENT & OEM DATA GAPS ACROSS THE CATALOG</div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:24 }}>
        <div className="report-card">
          <div className="report-card-header">
            <div className="report-card-title">MISSING FITMENT</div>
            <div className="report-card-count" style={{color:"#ff7a7a"}}>
              {(stats.total - stats.withFitment).toLocaleString()}
            </div>
          </div>
          <div style={{padding:"12px 16px"}}>
            <p style={{fontSize:10, color:"var(--chrome)", letterSpacing:"0.08em", marginBottom:10, lineHeight:1.6}}>
              Products with no rows in catalog_fitment_v2. These won't appear in year/model filtered searches.
            </p>
            <button className="btn btn-ghost btn-sm" onClick={() => runReport("missing_fitment")}>
              RUN REPORT
            </button>
          </div>
        </div>

        <div className="report-card">
          <div className="report-card-header">
            <div className="report-card-title">MISSING OEM #</div>
            <div className="report-card-count" style={{color:"var(--orange)"}}>
              {(stats.total - stats.withOem).toLocaleString()}
            </div>
          </div>
          <div style={{padding:"12px 16px"}}>
            <p style={{fontSize:10, color:"var(--chrome)", letterSpacing:"0.08em", marginBottom:10, lineHeight:1.6}}>
              Products with no OEM cross-reference entries. Affects OEM number search and PDP display.
            </p>
            <button className="btn btn-ghost btn-sm" onClick={() => runReport("missing_oem")}>
              RUN REPORT
            </button>
          </div>
        </div>

        <div className="report-card">
          <div className="report-card-header">
            <div className="report-card-title">FLAG MISMATCH</div>
            <div className="report-card-count" style={{color:"var(--gold)"}}>?</div>
          </div>
          <div style={{padding:"12px 16px"}}>
            <p style={{fontSize:10, color:"var(--chrome)", letterSpacing:"0.08em", marginBottom:10, lineHeight:1.6}}>
              Products flagged is_harley_fitment=true but with zero fitment rows, or vice versa.
            </p>
            <button className="btn btn-ghost btn-sm" onClick={() => runReport("flag_mismatch")}>
              RUN REPORT
            </button>
          </div>
        </div>
      </div>

      {/* Report Results */}
      {loading && (
        <div className="fm-loading"><div className="spinner" />RUNNING REPORT…</div>
      )}

      {reportData && !loading && (
        <div className="report-card">
          <div className="report-card-header">
            <div className="report-card-title">
              {reportData.type === "missing_fitment" && "PRODUCTS MISSING FITMENT DATA"}
              {reportData.type === "missing_oem"     && "PRODUCTS MISSING OEM NUMBERS"}
              {reportData.type === "flag_mismatch"   && "HD FLAG / FITMENT MISMATCHES"}
            </div>
            <div className="report-card-count">{reportData.rows.length.toLocaleString()}</div>
          </div>
          <div style={{maxHeight:400, overflowY:"auto"}}>
            <table className="fm-table">
              <thead>
                <tr>
                  <th>PRODUCT</th>
                  <th>BRAND</th>
                  <th>VENDOR</th>
                  <th>CATEGORY</th>
                  {reportData.type === "flag_mismatch" && <th>FLAG</th>}
                  {reportData.type === "flag_mismatch" && <th>FITMENT ROWS</th>}
                </tr>
              </thead>
              <tbody>
                {reportData.rows.slice(0, 200).map(r => (
                  <tr key={r.id}>
                    <td>
                      <span className="cell-name" title={r.name}>{r.name}</span>
                      <span className="cell-sku">{r.internal_sku ?? r.sku}</span>
                    </td>
                    <td><span className="cell-brand">{r.brand ?? "—"}</span></td>
                    <td><span className="badge">{r.source_vendor ?? "—"}</span></td>
                    <td style={{fontSize:10, color:"var(--chrome)"}}>{r.category ?? "—"}</td>
                    {reportData.type === "flag_mismatch" && (
                      <td>
                        <span className={`badge ${r.is_harley_fitment ? "badge-gold" : "badge-none"}`}>
                          {r.is_harley_fitment ? "HD=TRUE" : "HD=FALSE"}
                        </span>
                      </td>
                    )}
                    {reportData.type === "flag_mismatch" && (
                      <td style={{fontSize:10, color: r.fitment_count > 0 ? "var(--green)" : "#ff7a7a"}}>
                        {r.fitment_count ?? 0} ROWS
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {reportData.rows.length > 200 && (
              <div style={{padding:"12px 16px", fontSize:9, color:"var(--chrome)", letterSpacing:"0.1em"}}>
                SHOWING FIRST 200 OF {reportData.rows.length.toLocaleString()} RESULTS
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Product Fitment + OEM Editor Modal ───────────────────────────────────────
function ProductFitmentModal({ product, onClose, onSaved, showToast }) {
  const [fitmentRows, setFitmentRows] = useState([]);
  const [oemRows,     setOemRows]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [activeTab,   setActiveTab]   = useState("fitment");

  // New fitment form
  const [newFit, setNewFit] = useState({ family: "", model_code: "", year: "" });
  // New OEM form
  const [newOem, setNewOem] = useState({ oem_number: "", oem_manufacturer: "Harley-Davidson" });
  const [formError, setFormError] = useState("");

  // Fetch existing data
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [fitRes, oemRes] = await Promise.all([
          fetch(`/api/admin/fitment/product?id=${product.id}`),
          fetch(`/api/admin/fitment/oem?sku=${encodeURIComponent(product.sku)}`),
        ]);

        // Safe JSON parse — log raw text if it fails
        const fitText = await fitRes.text();
        const oemText = await oemRes.text();

        let fitData = { rows: [] };
        let oemData = { rows: [] };

        try { fitData = JSON.parse(fitText); } catch {
          console.error("fitment parse error, raw:", fitText.slice(0, 200));
        }
        try { oemData = JSON.parse(oemText); } catch {
          console.error("oem parse error, raw:", oemText.slice(0, 200));
        }

        setFitmentRows(fitData.rows ?? []);
        setOemRows(oemData.rows ?? []);
      } catch (e) {
        console.error("load error:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [product.id, product.sku]);

  // Add fitment row
  async function addFitment() {
    setFormError("");
    if (!newFit.family || !newFit.model_code || !newFit.year) {
      setFormError("Family, model code, and year are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/fitment/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: product.id, ...newFit, year: parseInt(newFit.year) }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setFitmentRows(r => [...r, data.row]);
      setNewFit({ family: "", model_code: "", year: "" });
      showToast("Fitment row added");
      onSaved();
    } catch {
      setFormError("Failed to add fitment row.");
    } finally {
      setSaving(false);
    }
  }

  // Delete fitment row
  async function deleteFitment(rowId) {
    try {
      await fetch(`/api/admin/fitment/delete?id=${rowId}`, { method: "DELETE" });
      setFitmentRows(r => r.filter(x => x.id !== rowId));
      showToast("Fitment row removed");
      onSaved();
    } catch {
      showToast("Delete failed", "error");
    }
  }

  // Add OEM number
  async function addOem() {
    setFormError("");
    if (!newOem.oem_number.trim()) {
      setFormError("OEM number is required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/fitment/oem/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: product.sku, ...newOem }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setOemRows(r => [...r, data.row]);
      setNewOem({ oem_number: "", oem_manufacturer: "Harley-Davidson" });
      showToast("OEM number added");
      onSaved();
    } catch {
      setFormError("Failed to add OEM number.");
    } finally {
      setSaving(false);
    }
  }

  // Delete OEM row
  async function deleteOem(rowId) {
    try {
      await fetch(`/api/admin/fitment/oem/delete?id=${rowId}`, { method: "DELETE" });
      setOemRows(r => r.filter(x => x.id !== rowId));
      showToast("OEM number removed");
      onSaved();
    } catch {
      showToast("Delete failed", "error");
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-header">
          <div>
            <div className="modal-title">EDIT <span>PRODUCT</span></div>
            <div className="modal-subtitle">
              {product.name} · {product.internal_sku ?? product.sku}
              {(product.vendor_sku || product.brand_part_number) && (
                <span style={{color:"var(--orange)", marginLeft:8}}>
                  · {product.vendor_sku || product.brand_part_number}
                </span>
              )}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Modal sub-tabs */}
        <div style={{ display:"flex", gap:1, background:"var(--steel)", borderBottom:"1px solid var(--steel)" }}>
          {["fitment","oem"].map(t => (
            <div
              key={t}
              onClick={() => { setActiveTab(t); setFormError(""); }}
              style={{
                padding:"9px 20px", fontSize:9, letterSpacing:"0.16em",
                cursor:"pointer", background: activeTab === t ? "rgba(232,98,26,0.08)" : "var(--coal)",
                borderBottom: activeTab === t ? "2px solid var(--orange)" : "2px solid transparent",
                color: activeTab === t ? "var(--orange)" : "var(--chrome)",
                transition:"all 0.15s",
              }}
            >
              {t === "fitment" ? `FITMENT (${fitmentRows.length})` : `OEM NUMBERS (${oemRows.length})`}
            </div>
          ))}
        </div>

        <div className="modal-body">
          {loading ? (
            <div className="fm-loading"><div className="spinner" />LOADING…</div>
          ) : (
            <>
              {formError && <div className="modal-error">{formError}</div>}

              {activeTab === "fitment" && (
                <>
                  <div className="modal-section">
                    <div className="modal-section-title">VEHICLE FITMENT — {fitmentRows.length} ROWS</div>
                    {fitmentRows.length === 0 ? (
                      <div style={{fontSize:10, color:"var(--chrome)", letterSpacing:"0.1em", padding:"12px 0"}}>
                        NO FITMENT DATA — ADD ROWS BELOW
                      </div>
                    ) : (
                      <div className="fitment-list">
                        {fitmentRows.map(r => (
                          <div key={r.id} className="fitment-row">
                            <span className="fit-family">{r.family}</span>
                            <span className="fit-model">{r.model ?? r.model_code}</span>
                            <span className="fit-code">{r.model_code}</span>
                            <span className="fit-year">{r.year}</span>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => deleteFitment(r.id)}
                              style={{marginLeft:"auto"}}
                            >✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="modal-section">
                    <div className="modal-section-title">ADD FITMENT ROW</div>
                    <div style={{fontSize:9, color:"var(--chrome)", letterSpacing:"0.1em", marginBottom:10, lineHeight:1.6}}>
                      Enter the exact model code from your HD models table (e.g. FLSTC, XL1200C, FXBB).
                      The family will be looked up automatically.
                    </div>
                    <div className="add-form-row">
                      <div>
                        <label className="form-label">FAMILY</label>
                        <select className="form-select" value={newFit.family} onChange={e => setNewFit(f => ({...f, family: e.target.value}))}>
                          <option value="">Select…</option>
                          {FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="form-label">MODEL CODE</label>
                        <input
                          className="form-input"
                          placeholder="e.g. FLSTC"
                          value={newFit.model_code}
                          onChange={e => setNewFit(f => ({...f, model_code: e.target.value.toUpperCase().trim()}))}
                        />
                      </div>
                      <div>
                        <label className="form-label">YEAR</label>
                        <input
                          className="form-input"
                          type="number"
                          placeholder="e.g. 2018"
                          min="1903" max="2030"
                          value={newFit.year}
                          onChange={e => setNewFit(f => ({...f, year: e.target.value}))}
                          onKeyDown={e => e.key === "Enter" && addFitment()}
                        />
                      </div>
                      <div>
                        <label className="form-label">&nbsp;</label>
                        <button className="btn btn-primary" onClick={addFitment} disabled={saving}>
                          {saving ? "…" : "ADD"}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {activeTab === "oem" && (
                <>
                  <div className="modal-section">
                    <div className="modal-section-title">OEM NUMBERS — {oemRows.length} ENTRIES</div>
                    {oemRows.length === 0 ? (
                      <div style={{fontSize:10, color:"var(--chrome)", letterSpacing:"0.1em", padding:"12px 0"}}>
                        NO OEM NUMBERS — ADD BELOW
                      </div>
                    ) : (
                      <div className="oem-list">
                        {oemRows.map(r => (
                          <div key={r.id} className="oem-row">
                            <span className="oem-number">{r.oem_number}</span>
                            <span className="oem-mfr">{r.oem_manufacturer ?? "—"}</span>
                            <span className="oem-source">{r.source_file ?? "manual"}</span>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => deleteOem(r.id)}
                              style={{marginLeft:"auto"}}
                            >✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="modal-section">
                    <div className="modal-section-title">ADD OEM NUMBER</div>
                    <div className="add-form-row" style={{gridTemplateColumns:"1fr 1fr auto"}}>
                      <div>
                        <label className="form-label">OEM NUMBER</label>
                        <input
                          className="form-input"
                          placeholder="e.g. 17000-08A"
                          value={newOem.oem_number}
                          onChange={e => setNewOem(o => ({...o, oem_number: e.target.value}))}
                        />
                      </div>
                      <div>
                        <label className="form-label">MANUFACTURER</label>
                        <input
                          className="form-input"
                          placeholder="Harley-Davidson"
                          value={newOem.oem_manufacturer}
                          onChange={e => setNewOem(o => ({...o, oem_manufacturer: e.target.value}))}
                        />
                      </div>
                      <div>
                        <label className="form-label">&nbsp;</label>
                        <button className="btn btn-primary" onClick={addOem} disabled={saving}>
                          {saving ? "…" : "ADD"}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>CLOSE</button>
        </div>
      </div>
    </div>
  );
}
