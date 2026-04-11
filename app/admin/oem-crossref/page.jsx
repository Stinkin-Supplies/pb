"use client";
// ============================================================
// app/admin/oem-crossref/page.jsx
// OEM Cross-Reference Dashboard
// — Paginated, searchable, filterable table view of
//   catalog_oem_crossref (HardDrive → WPS mappings)
// — Add / delete rows inline
// — Matches Stinkin' Supplies admin dark theme
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";

// ── Styles ────────────────────────────────────────────────────────────────────
const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --black:  #0a0909; --coal:   #111010; --iron:  #1a1919;
    --steel:  #2a2828; --chrome: #8a8784; --cream: #f0ebe3;
    --orange: #e8621a; --gold:   #c9a84c; --red:   #b91c1c;
    --green:  #22c55e; --blue:   #3b82f6;
  }

  .xref-wrap {
    background: var(--black);
    min-height: 100vh;
    color: var(--cream);
    font-family: var(--font-stencil), 'Share Tech Mono', monospace;
  }

  /* ── HEADER ── */
  .xref-header {
    background: var(--coal);
    border-bottom: 1px solid var(--steel);
    padding: 20px 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }
  .xref-title {
    font-family: var(--font-caesar), 'Bebas Neue', sans-serif;
    font-size: 28px;
    letter-spacing: 0.05em;
    line-height: 1;
  }
  .xref-title span { color: var(--orange); }
  .xref-subtitle {
    font-size: 9px;
    color: var(--chrome);
    letter-spacing: 0.18em;
    margin-top: 4px;
  }
  .xref-header-right { display: flex; gap: 8px; align-items: center; }

  /* ── STAT BAR ── */
  .xref-stats {
    display: flex;
    gap: 1px;
    background: var(--steel);
    border-bottom: 1px solid var(--steel);
  }
  .xref-stat {
    flex: 1;
    background: var(--coal);
    padding: 14px 20px;
  }
  .xref-stat-val {
    font-family: var(--font-caesar), 'Bebas Neue', sans-serif;
    font-size: 28px;
    letter-spacing: 0.04em;
    line-height: 1;
    color: var(--cream);
  }
  .xref-stat-val.orange { color: var(--orange); }
  .xref-stat-label {
    font-size: 8px;
    color: var(--chrome);
    letter-spacing: 0.16em;
    margin-top: 3px;
  }

  /* ── TOOLBAR ── */
  .xref-toolbar {
    padding: 12px 28px;
    background: var(--black);
    border-bottom: 1px solid var(--iron);
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  .xref-input {
    background: var(--iron);
    border: 1px solid var(--steel);
    color: var(--cream);
    padding: 7px 12px;
    border-radius: 2px;
    font-family: var(--font-stencil), monospace;
    font-size: 11px;
    letter-spacing: 0.06em;
    outline: none;
    transition: border-color 0.15s;
  }
  .xref-input:focus { border-color: var(--orange); }
  .xref-input::placeholder { color: var(--chrome); }
  .xref-input.search { width: 260px; }
  .xref-select {
    background: var(--iron);
    border: 1px solid var(--steel);
    color: var(--cream);
    padding: 7px 10px;
    border-radius: 2px;
    font-family: var(--font-stencil), monospace;
    font-size: 10px;
    letter-spacing: 0.06em;
    outline: none;
    cursor: pointer;
  }
  .xref-select:focus { border-color: var(--orange); }

  /* ── BUTTONS ── */
  .btn {
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.14em;
    padding: 8px 16px;
    border-radius: 2px;
    border: 1px solid;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .btn-ghost  { background: none; border-color: var(--steel); color: var(--chrome); }
  .btn-ghost:hover { border-color: var(--orange); color: var(--orange); }
  .btn-primary { background: var(--orange); border-color: var(--orange); color: var(--black); font-weight: 700; }
  .btn-primary:hover { background: #c94f0f; }
  .btn-danger  { background: none; border-color: rgba(185,28,28,0.4); color: var(--red); }
  .btn-danger:hover { background: rgba(185,28,28,0.1); border-color: var(--red); }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }

  /* ── TABLE ── */
  .xref-table-wrap {
    overflow-x: auto;
    min-height: 300px;
  }
  .xref-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .xref-table th {
    background: var(--coal);
    border-bottom: 1px solid var(--steel);
    padding: 10px 14px;
    text-align: left;
    font-size: 8px;
    color: var(--chrome);
    letter-spacing: 0.18em;
    font-weight: normal;
    white-space: nowrap;
    user-select: none;
    cursor: pointer;
    transition: color 0.15s;
    position: sticky;
    top: 0;
  }
  .xref-table th:hover { color: var(--cream); }
  .xref-table th.sorted { color: var(--orange); }
  .xref-table th .sort-arrow { margin-left: 5px; font-size: 9px; }
  .xref-table th.no-sort { cursor: default; }
  .xref-table th.no-sort:hover { color: var(--chrome); }

  .xref-table td {
    padding: 10px 14px;
    border-bottom: 1px solid rgba(255,255,255,0.03);
    vertical-align: middle;
    white-space: nowrap;
  }
  .xref-table tr:hover td { background: rgba(255,255,255,0.015); }

  .cell-oem   { font-family: var(--font-caesar), 'Bebas Neue', sans-serif; font-size: 15px; letter-spacing: 0.06em; color: var(--orange); }
  .cell-wps   { font-family: var(--font-stencil), monospace; font-size: 11px; color: var(--cream); letter-spacing: 0.05em; }
  .cell-brand { font-size: 11px; color: var(--chrome); }
  .cell-bpn   { font-family: var(--font-stencil), monospace; font-size: 10px; color: #5a5856; letter-spacing: 0.06em; }
  .cell-src   { font-size: 9px; color: #3a3838; letter-spacing: 0.1em; max-width: 160px; overflow: hidden; text-overflow: ellipsis; }

  .delete-btn {
    background: none;
    border: 1px solid transparent;
    color: #3a3838;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    padding: 3px 6px;
    border-radius: 2px;
    transition: all 0.15s;
  }
  .delete-btn:hover { border-color: rgba(185,28,28,0.4); color: var(--red); }

  /* ── EMPTY / LOADING ── */
  .xref-empty {
    text-align: center;
    padding: 60px 20px;
    font-size: 9px;
    color: #3a3838;
    letter-spacing: 0.2em;
  }
  .xref-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 60px;
    color: var(--chrome);
    font-size: 9px;
    letter-spacing: 0.18em;
  }
  .spinner {
    width: 16px; height: 16px;
    border: 2px solid var(--steel);
    border-top-color: var(--orange);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── PAGINATION ── */
  .xref-pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 28px;
    background: var(--coal);
    border-top: 1px solid var(--steel);
    flex-wrap: wrap;
    gap: 10px;
  }
  .page-info {
    font-size: 9px;
    color: var(--chrome);
    letter-spacing: 0.12em;
  }
  .page-info strong { color: var(--cream); }
  .page-btns { display: flex; gap: 6px; }
  .page-btn {
    background: var(--iron);
    border: 1px solid var(--steel);
    color: var(--chrome);
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.1em;
    padding: 6px 12px;
    border-radius: 2px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .page-btn:hover:not(:disabled) { border-color: var(--orange); color: var(--orange); }
  .page-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .page-btn.active { border-color: var(--orange); color: var(--orange); }

  /* ── ADD MODAL ── */
  .modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.7);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .modal {
    background: var(--coal);
    border: 1px solid var(--steel);
    border-radius: 3px;
    width: 100%;
    max-width: 480px;
    padding: 24px;
  }
  .modal-title {
    font-family: var(--font-caesar), 'Bebas Neue', sans-serif;
    font-size: 22px;
    letter-spacing: 0.06em;
    margin-bottom: 20px;
  }
  .modal-title span { color: var(--orange); }
  .modal-field { margin-bottom: 14px; }
  .modal-label {
    display: block;
    font-size: 8px;
    color: var(--chrome);
    letter-spacing: 0.18em;
    margin-bottom: 5px;
  }
  .modal-label .req { color: var(--orange); }
  .modal-actions { display: flex; gap: 8px; margin-top: 20px; justify-content: flex-end; }
  .modal-error {
    background: rgba(185,28,28,0.1);
    border: 1px solid rgba(185,28,28,0.3);
    color: var(--red);
    padding: 8px 12px;
    border-radius: 2px;
    font-size: 10px;
    margin-bottom: 14px;
    letter-spacing: 0.06em;
  }

  /* ── TOAST ── */
  .toast {
    position: fixed;
    bottom: 24px; right: 24px;
    z-index: 200;
    background: var(--coal);
    border: 1px solid var(--steel);
    border-left: 3px solid var(--orange);
    padding: 12px 18px;
    border-radius: 2px;
    font-size: 11px;
    letter-spacing: 0.08em;
    animation: slideIn 0.2s ease;
    max-width: 320px;
  }
  .toast.success { border-left-color: var(--green); }
  .toast.error   { border-left-color: var(--red); }
  @keyframes slideIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @media (max-width: 700px) {
    .xref-input.search { width: 100%; }
    .xref-stats { flex-wrap: wrap; }
    .xref-stat  { flex: 1 1 45%; }
  }
`;

// ── Component ─────────────────────────────────────────────────────────────────
const PAGE_SIZE = 50;
const LIMIT_OPTIONS = [25, 50, 100, 200];

export default function OemCrossRefPage() {
  // State
  const [rows,     setRows]     = useState([]);
  const [total,    setTotal]    = useState(0);
  const [brands,   setBrands]   = useState([]);
  const [sources,  setSources]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [page,     setPage]     = useState(0);
  const [limit,    setLimit]    = useState(PAGE_SIZE);
  const [search,   setSearch]   = useState("");
  const [brand,    setBrand]    = useState("");
  const [source,   setSource]   = useState("");
  const [sort,     setSort]     = useState("oem_number");
  const [dir,      setDir]      = useState("asc");
  const [showAdd,  setShowAdd]  = useState(false);
  const [toast,    setToast]    = useState(null);
  const [deleting, setDeleting] = useState(null);
  const searchRef = useRef(null);
  const searchTimer = useRef(null);

  // ── Fetch ──
  const fetchData = useCallback(async (overrides = {}) => {
    setLoading(true);
    const p = { page, limit, search, brand, source, sort, dir, ...overrides };
    const qs = new URLSearchParams({
      page:   String(p.page),
      limit:  String(p.limit),
      search: p.search,
      brand:  p.brand,
      source: p.source,
      sort:   p.sort,
      dir:    p.dir,
    }).toString();
    try {
      const res  = await fetch(`/api/admin/oem-crossref?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      if (data.brands)  setBrands(data.brands);
      if (data.sources) setSources(data.sources);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, brand, source, sort, dir]);

  useEffect(() => { fetchData(); }, [page, limit, brand, source, sort, dir]);

  // Debounce search
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(0);
      fetchData({ search, page: 0 });
    }, 300);
    return () => clearTimeout(searchTimer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // ── Toast ──
  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Sort toggle ──
  function handleSort(col) {
    if (sort === col) {
      const next = dir === "asc" ? "desc" : "asc";
      setDir(next);
      fetchData({ sort: col, dir: next, page: 0 });
    } else {
      setSort(col);
      setDir("asc");
      fetchData({ sort: col, dir: "asc", page: 0 });
    }
    setPage(0);
  }

  function sortArrow(col) {
    if (sort !== col) return <span className="sort-arrow" style={{ opacity: 0.2 }}>↕</span>;
    return <span className="sort-arrow">{dir === "asc" ? "↑" : "↓"}</span>;
  }

  // ── Delete ──
  async function handleDelete(id) {
    if (!confirm("Remove this cross-reference entry?")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/oem-crossref?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      showToast("Entry removed", "success");
      fetchData();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setDeleting(null);
    }
  }

  // ── Pagination ──
  const totalPages = Math.ceil(total / limit);
  function pageNumbers() {
    const nums = [];
    const start = Math.max(0, page - 2);
    const end   = Math.min(totalPages - 1, page + 2);
    for (let i = start; i <= end; i++) nums.push(i);
    return nums;
  }

  // ── Render ──
  const filteredCount = total;
  const startRow = page * limit + 1;
  const endRow   = Math.min((page + 1) * limit, total);

  return (
    <div className="xref-wrap">
      <style>{css}</style>

      {/* HEADER */}
      <div className="xref-header">
        <div>
          <div className="xref-title">OEM <span>CROSS-REFERENCE</span></div>
          <div className="xref-subtitle">HARDDRIVE → WPS PART NUMBER LOOKUP TABLE</div>
        </div>
        <div className="xref-header-right">
          <button className="btn btn-ghost" onClick={() => fetchData()}>↺ REFRESH</button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ ADD ENTRY</button>
        </div>
      </div>

      {/* STATS */}
      <div className="xref-stats">
        <div className="xref-stat">
          <div className={`xref-stat-val ${total > 0 ? "orange" : ""}`}>{total.toLocaleString()}</div>
          <div className="xref-stat-label">
            {search || brand || source ? "MATCHING ENTRIES" : "TOTAL ENTRIES"}
          </div>
        </div>
        <div className="xref-stat">
          <div className="xref-stat-val">{brands.length}</div>
          <div className="xref-stat-label">BRANDS</div>
        </div>
        <div className="xref-stat">
          <div className="xref-stat-val">{sources.length}</div>
          <div className="xref-stat-label">SOURCE FILES</div>
        </div>
        <div className="xref-stat">
          <div className="xref-stat-val">{rows.length}</div>
          <div className="xref-stat-label">SHOWING THIS PAGE</div>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="xref-toolbar">
        <input
          ref={searchRef}
          className="xref-input search"
          placeholder="Search OEM#, WPS#, brand, part#…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
        />

        <select
          className="xref-select"
          value={brand}
          onChange={e => { setBrand(e.target.value); setPage(0); }}
        >
          <option value="">ALL BRANDS</option>
          {brands.map(b => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>

        <select
          className="xref-select"
          value={source}
          onChange={e => { setSource(e.target.value); setPage(0); }}
        >
          <option value="">ALL SOURCES</option>
          {sources.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          className="xref-select"
          value={limit}
          onChange={e => { setLimit(Number(e.target.value)); setPage(0); }}
        >
          {LIMIT_OPTIONS.map(n => (
            <option key={n} value={n}>{n} / PAGE</option>
          ))}
        </select>

        {(search || brand || source) && (
          <button className="btn btn-ghost" onClick={() => {
            setSearch(""); setBrand(""); setSource(""); setPage(0);
          }}>
            ✕ CLEAR
          </button>
        )}
      </div>

      {/* TABLE */}
      <div className="xref-table-wrap">
        {loading ? (
          <div className="xref-loading">
            <div className="spinner" />
            LOADING…
          </div>
        ) : rows.length === 0 ? (
          <div className="xref-empty">
            NO ENTRIES FOUND
            {(search || brand || source) && (
              <div style={{ marginTop: 8, fontSize: 8 }}>TRY ADJUSTING YOUR FILTERS</div>
            )}
          </div>
        ) : (
          <table className="xref-table">
            <thead>
              <tr>
                <th onClick={() => handleSort("oem_number")} className={sort === "oem_number" ? "sorted" : ""}>
                  OEM # {sortArrow("oem_number")}
                </th>
                <th onClick={() => handleSort("sku")} className={sort === "sku" ? "sorted" : ""}>
                  WPS # {sortArrow("sku")}
                </th>
                <th onClick={() => handleSort("oem_manufacturer")} className={sort === "oem_manufacturer" ? "sorted" : ""}>
                  BRAND {sortArrow("oem_manufacturer")}
                </th>
                <th onClick={() => handleSort("page_reference")} className={sort === "page_reference" ? "sorted" : ""}>
                  BRAND PART # {sortArrow("page_reference")}
                </th>
                <th onClick={() => handleSort("source_file")} className={sort === "source_file" ? "sorted" : ""}>
                  SOURCE {sortArrow("source_file")}
                </th>
                <th className="no-sort" style={{ width: 48 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td><span className="cell-oem">{row.oem_number}</span></td>
                  <td><span className="cell-wps">{row.sku}</span></td>
                  <td><span className="cell-brand">{row.oem_manufacturer || "—"}</span></td>
                  <td><span className="cell-bpn">{row.page_reference || "—"}</span></td>
                  <td><span className="cell-src">{row.source_file || "—"}</span></td>
                  <td>
                    <button
                      className="delete-btn"
                      title="Delete entry"
                      disabled={deleting === row.id}
                      onClick={() => handleDelete(row.id)}
                    >
                      {deleting === row.id ? "…" : "✕"}
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
        <div className="xref-pagination">
          <div className="page-info">
            SHOWING <strong>{startRow.toLocaleString()}–{endRow.toLocaleString()}</strong> OF{" "}
            <strong>{filteredCount.toLocaleString()}</strong> ENTRIES
          </div>
          <div className="page-btns">
            <button className="page-btn" disabled={page === 0} onClick={() => setPage(0)}>««</button>
            <button className="page-btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹ PREV</button>
            {pageNumbers().map(n => (
              <button
                key={n}
                className={`page-btn ${n === page ? "active" : ""}`}
                onClick={() => setPage(n)}
              >
                {n + 1}
              </button>
            ))}
            <button className="page-btn" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>NEXT ›</button>
            <button className="page-btn" disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>»»</button>
          </div>
        </div>
      )}

      {/* ADD MODAL */}
      {showAdd && <AddModal onClose={() => setShowAdd(false)} onSuccess={() => { setShowAdd(false); fetchData(); showToast("Entry added"); }} />}

      {/* TOAST */}
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}

// ── Add Entry Modal ───────────────────────────────────────────────────────────
function AddModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    oem_number: "", sku: "", oem_manufacturer: "", page_reference: "", source_file: "manual",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    if (!form.oem_number.trim() || !form.sku.trim() || !form.oem_manufacturer.trim()) {
      setError("OEM #, WPS #, and Brand are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res  = await fetch("/api/admin/oem-crossref", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const fieldStyle = {
    background: "#1a1919", border: "1px solid #2a2828", color: "#f0ebe3",
    padding: "8px 12px", borderRadius: 2, width: "100%",
    fontFamily: "var(--font-stencil), monospace", fontSize: 12, letterSpacing: "0.05em",
    outline: "none",
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">ADD <span>ENTRY</span></div>
        {error && <div className="modal-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="modal-field">
            <label className="modal-label">OEM # <span className="req">*</span></label>
            <input style={fieldStyle} placeholder="e.g. 11101" value={form.oem_number}
              onChange={e => set("oem_number", e.target.value)} autoFocus />
          </div>
          <div className="modal-field">
            <label className="modal-label">WPS # <span className="req">*</span></label>
            <input style={fieldStyle} placeholder="e.g. 681-4810" value={form.sku}
              onChange={e => set("sku", e.target.value)} />
          </div>
          <div className="modal-field">
            <label className="modal-label">BRAND <span className="req">*</span></label>
            <input style={fieldStyle} placeholder="e.g. James Gaskets" value={form.oem_manufacturer}
              onChange={e => set("oem_manufacturer", e.target.value)} />
          </div>
          <div className="modal-field">
            <label className="modal-label">BRAND PART #</label>
            <input style={fieldStyle} placeholder="e.g. JGI-11101" value={form.page_reference}
              onChange={e => set("page_reference", e.target.value)} />
          </div>
          <div className="modal-field">
            <label className="modal-label">SOURCE FILE</label>
            <input style={fieldStyle} placeholder="manual" value={form.source_file}
              onChange={e => set("source_file", e.target.value)} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>CANCEL</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "SAVING…" : "SAVE ENTRY"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
