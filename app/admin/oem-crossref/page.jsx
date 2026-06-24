"use client";
// ============================================================
// app/admin/oem-crossref/page.jsx
// OEM Cross-Reference Dashboard
// — Paginated, searchable, filterable table view of
//   catalog_oem_crossref (HardDrive → WPS mappings)
// — Add / delete rows inline
// — Bulk edit: delete, change brand, add OEM# to selected rows
// — Matches Stinkin' Supplies admin dark theme
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";

// ── Styles ────────────────────────────────────────────────────────────────────
const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --black:  #f5f0e8; --coal:   #ffffff; --iron:  #fbf6ec;
    --steel:  #ddd0b8; --chrome: #7a6a4f; --cream: #1a1208;
    --orange: #c9a84c; --gold:   #c9a84c; --red:   #c0392b;
    --green:  #2f8552; --blue:   #3b78d8;
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
  .btn-primary { background: var(--orange); border-color: var(--orange); color: #1a1208; font-weight: 700; }
  .btn-primary:hover { background: #a3822c; }
  .btn-danger  { background: none; border-color: rgba(192,57,43,0.4); color: var(--red); }
  .btn-danger:hover { background: rgba(192,57,43,0.12); border-color: var(--red); }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }

  /* ── BULK ACTION BAR ── */
  .bulk-bar {
    background: #fff3e0;
    border-bottom: 1px solid #e8d5a8;
    padding: 10px 28px;
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    animation: slideDown 0.15s ease;
  }
  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .bulk-bar-count {
    font-family: var(--font-caesar), 'Bebas Neue', sans-serif;
    font-size: 16px;
    letter-spacing: 0.06em;
    color: var(--gold);
    white-space: nowrap;
  }
  .bulk-bar-count span { color: var(--cream); }
  .bulk-bar-divider {
    width: 1px;
    height: 20px;
    background: #e8d5a8;
    flex-shrink: 0;
  }
  .bulk-bar-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .btn-bulk {
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.14em;
    padding: 7px 14px;
    border-radius: 2px;
    border: 1px solid;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
    background: none;
  }
  .btn-bulk-brand  { border-color: rgba(201,168,76,0.4); color: var(--gold); }
  .btn-bulk-brand:hover  { background: rgba(201,168,76,0.14); border-color: var(--gold); }
  .btn-bulk-oem    { border-color: rgba(59,120,216,0.4); color: var(--blue); }
  .btn-bulk-oem:hover    { background: rgba(59,120,216,0.14); border-color: var(--blue); }
  .btn-bulk-delete { border-color: rgba(192,57,43,0.4); color: var(--red); }
  .btn-bulk-delete:hover { background: rgba(192,57,43,0.14); border-color: var(--red); }
  .btn-bulk:disabled { opacity: 0.3; cursor: not-allowed; }
  .bulk-bar-clear {
    margin-left: auto;
    background: none;
    border: none;
    color: var(--chrome);
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.12em;
    cursor: pointer;
    padding: 4px 6px;
    transition: color 0.15s;
  }
  .bulk-bar-clear:hover { color: var(--cream); }

  /* ── SELECT-ALL BANNER ── */
  .select-all-banner {
    background: #eef7e6;
    border-bottom: 1px solid #cfe8bd;
    padding: 9px 28px;
    display: flex;
    align-items: center;
    gap: 14px;
    font-size: 10px;
    color: var(--chrome);
    letter-spacing: 0.1em;
  }
  .select-all-banner strong { color: var(--green); }
  .btn-select-all-match {
    background: none;
    border: 1px solid rgba(47,133,82,0.4);
    color: var(--green);
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.12em;
    padding: 5px 12px;
    border-radius: 2px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .btn-select-all-match:hover { background: rgba(47,133,82,0.12); border-color: var(--green); }
  .btn-select-all-clear {
    background: none;
    border: none;
    color: var(--chrome);
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    letter-spacing: 0.1em;
    cursor: pointer;
    transition: color 0.15s;
  }
  .btn-select-all-clear:hover { color: var(--cream); }

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
  .xref-table th.col-check { width: 40px; padding: 10px 8px 10px 14px; }

  .xref-table td {
    padding: 10px 14px;
    border-bottom: 1px solid rgba(26,18,8,0.06);
    vertical-align: middle;
    white-space: nowrap;
  }
  .xref-table td.col-check { padding: 10px 8px 10px 14px; }
  .xref-table tr:hover td { background: rgba(201,168,76,0.05); }
  .xref-table tr.row-selected td { background: rgba(201,168,76,0.12); }
  .xref-table tr.row-selected:hover td { background: rgba(201,168,76,0.18); }

  /* custom checkbox */
  .xref-checkbox {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border: 1px solid var(--steel);
    border-radius: 2px;
    background: var(--iron);
    cursor: pointer;
    position: relative;
    flex-shrink: 0;
    transition: all 0.12s;
  }
  .xref-checkbox:checked {
    background: var(--gold);
    border-color: var(--gold);
  }
  .xref-checkbox:checked::after {
    content: '';
    position: absolute;
    top: 1px; left: 4px;
    width: 4px; height: 7px;
    border: 2px solid #1a1208;
    border-top: none; border-left: none;
    transform: rotate(45deg);
  }
  .xref-checkbox:indeterminate {
    background: var(--iron);
    border-color: var(--gold);
  }
  .xref-checkbox:indeterminate::after {
    content: '';
    position: absolute;
    top: 50%; left: 2px;
    width: 8px; height: 2px;
    background: var(--gold);
    transform: translateY(-50%);
  }
  .xref-checkbox:hover { border-color: var(--gold); }

  .cell-oem   { font-family: var(--font-caesar), 'Bebas Neue', sans-serif; font-size: 15px; letter-spacing: 0.06em; color: var(--orange); }
  .cell-wps   { font-family: var(--font-stencil), monospace; font-size: 11px; color: var(--cream); letter-spacing: 0.05em; }
  .cell-brand { font-size: 11px; color: var(--chrome); }
  .cell-bpn   { font-family: var(--font-stencil), monospace; font-size: 10px; color: #8a7a60; letter-spacing: 0.06em; }
  .cell-src   { font-size: 9px; color: #b3a890; letter-spacing: 0.1em; max-width: 160px; overflow: hidden; text-overflow: ellipsis; }

  .delete-btn {
    background: none;
    border: 1px solid transparent;
    color: #b3a890;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    padding: 3px 6px;
    border-radius: 2px;
    transition: all 0.15s;
  }
  .delete-btn:hover { border-color: rgba(192,57,43,0.4); color: var(--red); }

  /* ── EMPTY / LOADING ── */
  .xref-empty {
    text-align: center;
    padding: 60px 20px;
    font-size: 9px;
    color: #b3a890;
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

  /* ── MODALS ── */
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
    margin-bottom: 4px;
  }
  .modal-title span { color: var(--orange); }
  .modal-subtitle {
    font-size: 9px;
    color: var(--chrome);
    letter-spacing: 0.14em;
    margin-bottom: 20px;
  }
  .modal-subtitle strong { color: var(--gold); }
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
    background: rgba(192,57,43,0.1);
    border: 1px solid rgba(192,57,43,0.3);
    color: var(--red);
    padding: 8px 12px;
    border-radius: 2px;
    font-size: 10px;
    margin-bottom: 14px;
    letter-spacing: 0.06em;
  }
  .modal-warn {
    background: rgba(192,57,43,0.08);
    border: 1px solid rgba(192,57,43,0.25);
    border-radius: 2px;
    padding: 14px 16px;
    margin-bottom: 20px;
    font-size: 10px;
    color: #993C1D;
    letter-spacing: 0.06em;
    line-height: 1.6;
  }
  .modal-warn strong { color: var(--red); display: block; font-size: 11px; margin-bottom: 4px; }

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
  // ── Core state ──
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

  // ── Selection state ──
  // selectedIds: Set of row IDs selected on the current page via checkboxes
  // allMatchingSelected: true when user clicks "select all N matching"
  const [selectedIds,          setSelectedIds]          = useState(new Set());
  const [allMatchingSelected,  setAllMatchingSelected]  = useState(false);

  // ── Bulk action modals ──
  const [bulkModal, setBulkModal] = useState(null); // "delete" | "brand" | "oem"
  const [bulkWorking, setBulkWorking] = useState(false);

  const searchRef    = useRef(null);
  const searchTimer  = useRef(null);
  const metaLoadedRef = useRef(false); // tracks whether brand/source dropdown lists have been fetched yet

  // ── Fetch ──
  // Brand/source lists are full-table DISTINCT scans on the backend — only
  // requested on first load, explicit refresh, or after a mutation that could
  // change them (add/bulk add/bulk brand change/bulk delete). Plain
  // pagination/sort/search changes skip them via metaLoadedRef.
  const fetchData = useCallback(async (overrides = {}) => {
    setLoading(true);
    const { includeMeta: includeMetaOverride, ...rest } = overrides;
    const p = { page, limit, search, brand, source, sort, dir, ...rest };
    const includeMeta = includeMetaOverride ?? !metaLoadedRef.current;
    const qs = new URLSearchParams({
      page:   String(p.page),
      limit:  String(p.limit),
      search: p.search,
      brand:  p.brand,
      source: p.source,
      sort:   p.sort,
      dir:    p.dir,
      ...(includeMeta ? { meta: "1" } : {}),
    }).toString();
    try {
      const res  = await fetch(`/api/admin/oem-crossref?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      if (data.brands)  { setBrands(data.brands); metaLoadedRef.current = true; }
      if (data.sources) { setSources(data.sources); metaLoadedRef.current = true; }
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

  // Clear selection when page/filters change
  useEffect(() => {
    setSelectedIds(new Set());
    setAllMatchingSelected(false);
  }, [page, limit, search, brand, source, sort, dir]);

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

  // ── Single delete ──
  async function handleDelete(id) {
    if (!confirm("Remove this cross-reference entry?")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/oem-crossref?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      showToast("Entry removed", "success");
      fetchData({ includeMeta: true });
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setDeleting(null);
    }
  }

  // ── Checkbox helpers ──
  const pageIds = rows.map(r => r.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every(id => selectedIds.has(id));
  const somePageSelected = pageIds.some(id => selectedIds.has(id));
  const selectionCount = allMatchingSelected ? total : selectedIds.size;

  function toggleRow(id) {
    setAllMatchingSelected(false);
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function togglePageAll() {
    setAllMatchingSelected(false);
    if (allPageSelected) {
      // deselect all on page
      setSelectedIds(prev => {
        const next = new Set(prev);
        pageIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      // select all on page
      setSelectedIds(prev => {
        const next = new Set(prev);
        pageIds.forEach(id => next.add(id));
        return next;
      });
    }
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setAllMatchingSelected(false);
  }

  // ── Bulk operations ──
  // Build the payload descriptor for the API
  function bulkTarget() {
    if (allMatchingSelected) {
      // Pass current filters so the API can scope the query
      return { mode: "filter", search, brand, source };
    }
    return { mode: "ids", ids: [...selectedIds] };
  }

  async function handleBulkDelete() {
    setBulkWorking(true);
    try {
      const res = await fetch("/api/admin/oem-crossref/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bulkTarget()),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bulk delete failed");
      showToast(`${data.deleted.toLocaleString()} entries deleted`, "success");
      clearSelection();
      setBulkModal(null);
      fetchData({ includeMeta: true });
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setBulkWorking(false);
    }
  }

  async function handleBulkBrand(newBrand) {
    setBulkWorking(true);
    try {
      const res = await fetch("/api/admin/oem-crossref/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...bulkTarget(), field: "oem_manufacturer", value: newBrand }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bulk update failed");
      showToast(`${data.updated.toLocaleString()} entries updated`, "success");
      clearSelection();
      setBulkModal(null);
      fetchData({ includeMeta: true });
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setBulkWorking(false);
    }
  }

  async function handleBulkAddOem(oemNumber, oemManufacturer) {
    setBulkWorking(true);
    try {
      const res = await fetch("/api/admin/oem-crossref/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...bulkTarget(),
          oem_number: oemNumber,
          oem_manufacturer: oemManufacturer,
          source_file: "bulk_add",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bulk add failed");
      showToast(`${data.inserted.toLocaleString()} entries added (${data.skipped ?? 0} skipped as dupes)`, "success");
      clearSelection();
      setBulkModal(null);
      fetchData({ includeMeta: true });
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setBulkWorking(false);
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

  // Show "select all N matching" banner when entire page is checked but not all matching selected
  const showSelectAllBanner = allPageSelected && !allMatchingSelected && total > rows.length;

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
          <button className="btn btn-ghost" onClick={() => fetchData({ includeMeta: true })}>↺ REFRESH</button>
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

      {/* BULK ACTION BAR — appears when rows are selected */}
      {selectionCount > 0 && (
        <div className="bulk-bar">
          <div className="bulk-bar-count">
            <span>{selectionCount.toLocaleString()}</span> ROW{selectionCount !== 1 ? "S" : ""} SELECTED
          </div>
          <div className="bulk-bar-divider" />
          <div className="bulk-bar-actions">
            <button
              className="btn-bulk btn-bulk-brand"
              disabled={bulkWorking}
              onClick={() => setBulkModal("brand")}
            >
              ✎ CHANGE BRAND
            </button>
            <button
              className="btn-bulk btn-bulk-oem"
              disabled={bulkWorking}
              onClick={() => setBulkModal("oem")}
            >
              + ADD OEM #
            </button>
            <button
              className="btn-bulk btn-bulk-delete"
              disabled={bulkWorking}
              onClick={() => setBulkModal("delete")}
            >
              ✕ DELETE SELECTED
            </button>
          </div>
          <button className="bulk-bar-clear" onClick={clearSelection}>
            CLEAR SELECTION
          </button>
        </div>
      )}

      {/* SELECT-ALL-MATCHING BANNER */}
      {showSelectAllBanner && (
        <div className="select-all-banner">
          All <strong>{rows.length}</strong> rows on this page are selected.
          <button
            className="btn-select-all-match"
            onClick={() => setAllMatchingSelected(true)}
          >
            SELECT ALL {total.toLocaleString()} MATCHING ENTRIES
          </button>
          <button className="btn-select-all-clear" onClick={clearSelection}>
            Clear selection
          </button>
        </div>
      )}
      {allMatchingSelected && (
        <div className="select-all-banner">
          All <strong>{total.toLocaleString()}</strong> matching entries are selected.
          <button className="btn-select-all-clear" onClick={clearSelection}>
            Clear selection
          </button>
        </div>
      )}

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
                <th className="col-check no-sort">
                  <input
                    type="checkbox"
                    className="xref-checkbox"
                    checked={allPageSelected}
                    ref={el => {
                      if (el) el.indeterminate = somePageSelected && !allPageSelected;
                    }}
                    onChange={togglePageAll}
                    title={allPageSelected ? "Deselect page" : "Select page"}
                  />
                </th>
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
                <tr key={row.id} className={selectedIds.has(row.id) ? "row-selected" : ""}>
                  <td className="col-check">
                    <input
                      type="checkbox"
                      className="xref-checkbox"
                      checked={selectedIds.has(row.id)}
                      onChange={() => toggleRow(row.id)}
                    />
                  </td>
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
      {showAdd && (
        <AddModal
          onClose={() => setShowAdd(false)}
          onSuccess={() => { setShowAdd(false); fetchData({ includeMeta: true }); showToast("Entry added"); }}
        />
      )}

      {/* BULK DELETE MODAL */}
      {bulkModal === "delete" && (
        <BulkDeleteModal
          count={selectionCount}
          allMatching={allMatchingSelected}
          working={bulkWorking}
          onClose={() => setBulkModal(null)}
          onConfirm={handleBulkDelete}
        />
      )}

      {/* BULK BRAND MODAL */}
      {bulkModal === "brand" && (
        <BulkBrandModal
          count={selectionCount}
          allMatching={allMatchingSelected}
          working={bulkWorking}
          brands={brands}
          onClose={() => setBulkModal(null)}
          onConfirm={handleBulkBrand}
        />
      )}

      {/* BULK ADD OEM MODAL */}
      {bulkModal === "oem" && (
        <BulkAddOemModal
          count={selectionCount}
          allMatching={allMatchingSelected}
          working={bulkWorking}
          onClose={() => setBulkModal(null)}
          onConfirm={handleBulkAddOem}
        />
      )}

      {/* TOAST */}
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}

// ── Shared field style ────────────────────────────────────────────────────────
const fieldStyle = {
  background: "#fbf6ec", border: "1px solid #ddd0b8", color: "#1a1208",
  padding: "8px 12px", borderRadius: 2, width: "100%",
  fontFamily: "var(--font-stencil), monospace", fontSize: 12, letterSpacing: "0.05em",
  outline: "none",
};

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

// ── Bulk Delete Modal ─────────────────────────────────────────────────────────
function BulkDeleteModal({ count, allMatching, working, onClose, onConfirm }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">DELETE <span>ENTRIES</span></div>
        <div className="modal-subtitle">
          <strong>{count.toLocaleString()}</strong> {allMatching ? "ALL MATCHING" : "SELECTED"} ROW{count !== 1 ? "S" : ""}
        </div>
        <div className="modal-warn">
          <strong>⚠ THIS CANNOT BE UNDONE</strong>
          Deleting {count.toLocaleString()} {count !== 1 ? "entries" : "entry"} will permanently remove{" "}
          {count !== 1 ? "them" : "it"} from <code>catalog_oem_crossref</code>. You should rebuild{" "}
          <code>oem_numbers[]</code> on <code>catalog_unified</code> after large deletes.
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose} disabled={working}>CANCEL</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={working}>
            {working ? "DELETING…" : `DELETE ${count.toLocaleString()} ENTR${count !== 1 ? "IES" : "Y"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bulk Change Brand Modal ───────────────────────────────────────────────────
function BulkBrandModal({ count, allMatching, working, brands, onClose, onConfirm }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  function submit(e) {
    e.preventDefault();
    if (!value.trim()) { setError("Brand name is required."); return; }
    onConfirm(value.trim());
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">CHANGE <span>BRAND</span></div>
        <div className="modal-subtitle">
          APPLYING TO <strong>{count.toLocaleString()}</strong> {allMatching ? "ALL MATCHING" : "SELECTED"} ROW{count !== 1 ? "S" : ""}
        </div>
        {error && <div className="modal-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="modal-field">
            <label className="modal-label">NEW BRAND (OEM_MANUFACTURER) <span className="req">*</span></label>
            {/* Combo: datalist lets them type or pick from existing brands */}
            <input
              list="brand-suggestions"
              style={fieldStyle}
              placeholder="Type or pick an existing brand…"
              value={value}
              onChange={e => { setValue(e.target.value); setError(""); }}
              autoFocus
            />
            <datalist id="brand-suggestions">
              {brands.map(b => <option key={b} value={b} />)}
            </datalist>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={working}>CANCEL</button>
            <button type="submit" className="btn btn-primary" disabled={working}>
              {working ? "UPDATING…" : `UPDATE ${count.toLocaleString()} ROW${count !== 1 ? "S" : ""}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Bulk Add OEM # Modal ──────────────────────────────────────────────────────
function BulkAddOemModal({ count, allMatching, working, onClose, onConfirm }) {
  const [oemNumber,       setOemNumber]       = useState("");
  const [oemManufacturer, setOemManufacturer] = useState("HD");
  const [error,           setError]           = useState("");

  function submit(e) {
    e.preventDefault();
    if (!oemNumber.trim())       { setError("OEM # is required."); return; }
    if (!oemManufacturer.trim()) { setError("Manufacturer is required."); return; }
    onConfirm(oemNumber.trim(), oemManufacturer.trim());
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">ADD <span>OEM #</span></div>
        <div className="modal-subtitle">
          ADDING TO SKUS OF <strong>{count.toLocaleString()}</strong> {allMatching ? "ALL MATCHING" : "SELECTED"} ROW{count !== 1 ? "S" : ""}
        </div>
        <p style={{ fontSize: 10, color: "#7a6a4f", letterSpacing: "0.08em", marginBottom: 16, lineHeight: 1.6 }}>
          A new <code>catalog_oem_crossref</code> row will be inserted for each unique SKU in your
          selection with this OEM # + manufacturer. Duplicate (sku, oem_number, oem_manufacturer)
          combinations are silently skipped.
        </p>
        {error && <div className="modal-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="modal-field">
            <label className="modal-label">OEM # <span className="req">*</span></label>
            <input
              style={fieldStyle}
              placeholder="e.g. 11101-70"
              value={oemNumber}
              onChange={e => { setOemNumber(e.target.value); setError(""); }}
              autoFocus
            />
          </div>
          <div className="modal-field">
            <label className="modal-label">MANUFACTURER <span className="req">*</span></label>
            <input
              style={fieldStyle}
              placeholder="e.g. HD"
              value={oemManufacturer}
              onChange={e => { setOemManufacturer(e.target.value); setError(""); }}
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={working}>CANCEL</button>
            <button type="submit" className="btn btn-primary" disabled={working}>
              {working ? "ADDING…" : `ADD TO ${count.toLocaleString()} ROW${count !== 1 ? "S" : ""}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
