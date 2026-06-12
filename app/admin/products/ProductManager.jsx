'use client';
/**
 * components/admin/ProductManager.jsx
 *
 * Upgraded product manager with:
 *  - Native scroll virtualization (no deps) — only visible rows rendered
 *  - Inline cell editing (double-click name, brand, category, price)
 *  - Expanded EditModal: all fields + era flags + images
 *  - Data tab toggle: Products ↔ Fitment (catalog_fitment_v2)
 *  - Bulk actions: activate, deactivate, assign fitment, delete
 *
 * Props: { brands, categories, vendorCounts, families }
 * API deps (unchanged): /api/admin/products, /api/admin/products/bulk,
 *   /api/admin/products/[id], /api/admin/products/[id]/fitment,
 *   /api/fitment/models, /api/fitment/years
 * New API dep: /api/admin/fitment  (GET ?q=&page=&limit=, PATCH, DELETE)
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────
const PAGE_SIZE     = 100;   // products per API page
const ROW_HEIGHT    = 46;    // px — virtualized row height
const FIT_PAGE_SIZE = 200;   // fitment rows per API page

const ERA_FLAGS = [
  { key: 'era_flathead',      label: 'Flathead' },
  { key: 'era_knucklehead',   label: 'Knucklehead' },
  { key: 'era_panhead',       label: 'Panhead' },
  { key: 'era_shovelhead',    label: 'Shovelhead' },
  { key: 'era_ironhead',      label: 'Ironhead' },
  { key: 'era_evo_sportster', label: 'Evo Sportster' },
  { key: 'era_evolution',     label: 'Evolution' },
  { key: 'era_twin_cam',      label: 'Twin Cam' },
  { key: 'era_milwaukee8',    label: 'Milwaukee-8' },
  { key: 'era_chopper',       label: 'Chopper' },
];

// ─── CSS ──────────────────────────────────────────────────────────────────────
const css = `
  :root {
    --bg: #0e0e0f;
    --surface: #161618;
    --surface2: #1e1e21;
    --border: #2a2a2e;
    --border2: #38383e;
    --text: #e8e8ea;
    --muted: #6e6e7a;
    --accent: #ff4d00;
    --accent2: #ff7a3d;
    --green: #22c55e;
    --yellow: #eab308;
    --red: #ef4444;
    --blue: #3b82f6;
    --radius: 6px;
    --font: 'DM Mono', 'Fira Mono', monospace;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .pm-wrap { font-family: var(--font); background: var(--bg); color: var(--text); min-height: 100vh; font-size: 13px; }

  /* Header */
  .pm-header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 14px 24px; display: flex; align-items: center; gap: 14px; position: sticky; top: 0; z-index: 50; }
  .pm-header h1 { font-size: 14px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
  .pm-header-accent { color: var(--accent); }
  .pm-back { color: var(--muted); text-decoration: none; font-size: 12px; letter-spacing: 0.06em; display: flex; align-items: center; gap: 5px; transition: color 0.15s; }
  .pm-back:hover { color: var(--text); }
  .pm-sep { color: var(--border2); }

  /* Tab switcher */
  .pm-tabs { display: flex; gap: 2px; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); padding: 3px; }
  .pm-tab { padding: 6px 14px; border-radius: 4px; border: none; background: transparent; color: var(--muted); font-family: var(--font); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
  .pm-tab.active { background: var(--surface); color: var(--text); border: 1px solid var(--border); }

  /* Body */
  .pm-body { padding: 20px 24px; max-width: 1800px; }

  /* Stats */
  .pm-stats { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
  .pm-stat { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 5px 11px; font-size: 11px; color: var(--muted); display: flex; align-items: center; gap: 6px; }
  .pm-stat strong { color: var(--text); font-size: 13px; }

  /* Filters */
  .pm-filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; align-items: center; }
  .pm-search { flex: 1; min-width: 220px; max-width: 360px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 7px 11px; color: var(--text); font-family: var(--font); font-size: 12px; outline: none; transition: border-color 0.15s; }
  .pm-search:focus { border-color: var(--accent); }
  .pm-search::placeholder { color: var(--muted); }
  .pm-select { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 7px 10px; color: var(--text); font-family: var(--font); font-size: 12px; outline: none; cursor: pointer; transition: border-color 0.15s; }
  .pm-select:focus { border-color: var(--accent); }

  /* Buttons */
  .pm-btn { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); padding: 7px 13px; color: var(--text); font-family: var(--font); font-size: 12px; letter-spacing: 0.04em; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
  .pm-btn:hover { border-color: var(--border2); background: var(--border); }
  .pm-btn.accent { background: var(--accent); border-color: var(--accent); color: #fff; }
  .pm-btn.accent:hover { background: var(--accent2); border-color: var(--accent2); }
  .pm-btn.danger { background: transparent; border-color: var(--red); color: var(--red); }
  .pm-btn.danger:hover { background: var(--red); color: #fff; }
  .pm-btn.success { background: transparent; border-color: var(--green); color: var(--green); }
  .pm-btn.success:hover { background: var(--green); color: #fff; }
  .pm-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  /* Bulk bar */
  .pm-bulk-bar { display: flex; align-items: center; gap: 8px; background: var(--surface); border: 1px solid var(--accent); border-radius: var(--radius); padding: 9px 14px; margin-bottom: 12px; animation: slideIn 0.15s ease; }
  @keyframes slideIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
  .pm-bulk-count { font-weight: 600; color: var(--accent); }
  .pm-bulk-label { color: var(--muted); flex: 1; font-size: 12px; }

  /* Virtualized table container */
  .pm-vt-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
  .pm-vt-head { display: flex; align-items: center; background: var(--surface2); border-bottom: 1px solid var(--border); padding: 0; user-select: none; }
  .pm-vt-head-cell { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); padding: 9px 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0; }
  .pm-vt-head-cell.sortable { cursor: pointer; }
  .pm-vt-head-cell.sortable:hover { color: var(--text); }

  /* Virtualized rows */
  .pm-vt-row { display: flex; align-items: center; border-bottom: 1px solid var(--border); transition: background 0.1s; }
  .pm-vt-row:hover { background: var(--surface2) !important; }
  .pm-vt-row.selected { background: rgba(255,77,0,0.06) !important; }
  .pm-vt-cell { padding: 0 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; flex-shrink: 0; display: flex; align-items: center; height: 100%; }

  /* Inline edit cell */
  .pm-vt-cell.editable { cursor: text; }
  .pm-vt-cell.editable:hover { background: rgba(255,255,255,0.03); outline: 1px solid var(--border2); outline-offset: -1px; }
  .pm-inline-input { background: var(--surface2); border: 1px solid var(--accent); border-radius: 3px; color: var(--text); font-family: var(--font); font-size: 12px; padding: 2px 6px; width: 100%; outline: none; }

  /* Badges */
  .pm-badge { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 10px; letter-spacing: 0.06em; font-weight: 600; text-transform: uppercase; }
  .badge-wps   { background: rgba(59,130,246,0.15); color: #60a5fa; }
  .badge-pu    { background: rgba(168,85,247,0.15); color: #c084fc; }
  .badge-vtwin { background: rgba(234,179,8,0.15);  color: #fbbf24; }
  .badge-active   { background: rgba(34,197,94,0.12);  color: var(--green); }
  .badge-inactive { background: rgba(239,68,68,0.12);  color: var(--red); }
  .badge-disc     { background: rgba(107,114,128,0.15); color: #9ca3af; }

  .pm-img-thumb { width: 28px; height: 28px; object-fit: cover; border-radius: 3px; background: var(--surface2); }
  .pm-img-ph { width: 28px; height: 28px; border-radius: 3px; background: var(--surface2); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; color: var(--border2); font-size: 12px; }
  .pm-edit-btn { background: none; border: 1px solid var(--border); border-radius: 4px; padding: 3px 7px; color: var(--muted); font-family: var(--font); font-size: 11px; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
  .pm-edit-btn:hover { border-color: var(--accent); color: var(--accent); }

  /* Pagination */
  .pm-pagination { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-top: 1px solid var(--border); background: var(--surface); }
  .pm-page-info { color: var(--muted); font-size: 11px; }
  .pm-page-btns { display: flex; gap: 6px; }

  /* Loading / empty */
  .pm-loading { padding: 50px; text-align: center; color: var(--muted); }
  .pm-spinner { display: inline-block; width: 18px; height: 18px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.7s linear infinite; margin-bottom: 10px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .pm-empty { padding: 40px; text-align: center; color: var(--muted); }

  /* Modal */
  .pm-modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.72); backdrop-filter: blur(3px); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
  .pm-modal { background: var(--surface); border: 1px solid var(--border2); border-radius: 8px; width: 100%; max-height: 92vh; overflow-y: auto; position: relative; animation: modalIn 0.16s ease; }
  @keyframes modalIn { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
  .pm-modal.narrow { max-width: 520px; }
  .pm-modal.wide   { max-width: 900px; }
  .pm-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--surface); z-index: 2; }
  .pm-modal-title { font-size: 13px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
  .pm-modal-close { background: none; border: none; color: var(--muted); font-size: 20px; cursor: pointer; line-height: 1; padding: 2px 5px; border-radius: 4px; transition: color 0.15s; }
  .pm-modal-close:hover { color: var(--text); }
  .pm-modal-body { padding: 20px; }
  .pm-modal-footer { display: flex; gap: 8px; justify-content: flex-end; padding: 14px 20px; border-top: 1px solid var(--border); background: var(--surface); position: sticky; bottom: 0; }

  /* Modal tabs */
  .pm-modal-tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); margin-bottom: 20px; }
  .pm-modal-tab { padding: 9px 16px; background: none; border: none; border-bottom: 2px solid transparent; margin-bottom: -1px; color: var(--muted); font-family: var(--font); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; transition: all 0.15s; }
  .pm-modal-tab.active { color: var(--text); border-bottom-color: var(--accent); }

  /* Form */
  .pm-field { margin-bottom: 16px; }
  .pm-label { display: block; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin-bottom: 5px; }
  .pm-input, .pm-textarea { width: 100%; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); padding: 8px 11px; color: var(--text); font-family: var(--font); font-size: 12px; outline: none; transition: border-color 0.15s; }
  .pm-input:focus, .pm-textarea:focus { border-color: var(--accent); }
  .pm-textarea { min-height: 80px; resize: vertical; }
  .pm-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .pm-row3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }

  /* Toggles */
  .pm-toggle-row { display: flex; align-items: center; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--border); }
  .pm-toggle-row:last-child { border-bottom: none; }
  .pm-toggle-label { flex: 1; font-size: 12px; }
  .pm-toggle-sub { font-size: 11px; color: var(--muted); margin-top: 2px; }
  .pm-toggle { position: relative; width: 34px; height: 19px; flex-shrink: 0; }
  .pm-toggle input { opacity: 0; width: 0; height: 0; }
  .pm-toggle-slider { position: absolute; inset: 0; background: var(--border2); border-radius: 20px; cursor: pointer; transition: 0.2s; }
  .pm-toggle-slider:before { content: ''; position: absolute; left: 3px; top: 3px; width: 13px; height: 13px; background: #fff; border-radius: 50%; transition: 0.2s; }
  .pm-toggle input:checked + .pm-toggle-slider { background: var(--green); }
  .pm-toggle input:checked + .pm-toggle-slider:before { transform: translateX(15px); }

  /* Era flags grid */
  .pm-era-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
  .pm-era-pill { display: flex; align-items: center; gap: 6px; background: var(--surface2); border: 1px solid var(--border); border-radius: 4px; padding: 6px 9px; cursor: pointer; transition: border-color 0.15s; font-size: 11px; }
  .pm-era-pill.on { border-color: var(--green); color: var(--green); }
  .pm-era-pill input { accent-color: var(--green); }

  /* Features */
  .pm-features-list { display: flex; flex-direction: column; gap: 5px; margin-bottom: 8px; }
  .pm-feature-row { display: flex; gap: 6px; align-items: center; }
  .pm-feature-row .pm-input { flex: 1; }
  .pm-feature-del { background: none; border: 1px solid var(--border); border-radius: 4px; color: var(--muted); width: 26px; height: 26px; cursor: pointer; font-size: 13px; display: flex; align-items: center; justify-content: center; transition: all 0.15s; flex-shrink: 0; }
  .pm-feature-del:hover { border-color: var(--red); color: var(--red); }

  /* Fitment section */
  .pm-fitment-list { display: flex; flex-direction: column; gap: 5px; margin-bottom: 12px; max-height: 280px; overflow-y: auto; }
  .pm-fitment-row { display: flex; align-items: center; gap: 8px; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); padding: 7px 11px; font-size: 12px; }
  .pm-fitment-row span { flex: 1; }
  .pm-fitment-del { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 14px; padding: 2px 4px; border-radius: 3px; transition: color 0.15s; }
  .pm-fitment-del:hover { color: var(--red); }
  .pm-fitment-add { display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 8px; align-items: end; }

  /* Images */
  .pm-img-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 8px; }
  .pm-img-item { aspect-ratio: 1; background: var(--surface2); border: 1px solid var(--border); border-radius: 4px; overflow: hidden; position: relative; }
  .pm-img-item img { width: 100%; height: 100%; object-fit: contain; padding: 4px; }
  .pm-img-del { position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,0.7); border: none; color: #fff; width: 18px; height: 18px; border-radius: 50%; cursor: pointer; font-size: 11px; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.15s; }
  .pm-img-item:hover .pm-img-del { opacity: 1; }

  /* Section divider */
  .pm-divider { border: none; border-top: 1px solid var(--border); margin: 18px 0; }
  .pm-section-title { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }

  /* Toast */
  .pm-toast { position: fixed; bottom: 20px; right: 20px; background: var(--surface); border: 1px solid var(--border2); border-radius: var(--radius); padding: 11px 16px; font-size: 12px; z-index: 200; animation: toastIn 0.18s ease; max-width: 320px; }
  @keyframes toastIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  .pm-toast.ok  { border-color: var(--green); color: var(--green); }
  .pm-toast.err { border-color: var(--red);   color: var(--red);   }

  .pm-confirm-msg { color: var(--text); margin-bottom: 16px; line-height: 1.6; }
  .pm-confirm-msg strong { color: var(--accent); }

  /* Fitment data table (non-virtualized — simpler for this tab) */
  .pm-fit-table { width: 100%; border-collapse: collapse; }
  .pm-fit-table th { background: var(--surface2); padding: 8px 10px; text-align: left; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); border-bottom: 1px solid var(--border); white-space: nowrap; }
  .pm-fit-table td { padding: 8px 10px; border-bottom: 1px solid var(--border); font-size: 12px; }
  .pm-fit-table tr:last-child td { border-bottom: none; }
  .pm-fit-table tr:hover td { background: var(--surface2); }
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function vendorBadge(v) {
  if (!v) return null;
  const cls = v === 'WPS' ? 'badge-wps' : v === 'PU' ? 'badge-pu' : v === 'VTWIN' ? 'badge-vtwin' : '';
  return <span className={`pm-badge ${cls}`}>{v}</span>;
}
function statusBadge(row) {
  if (row.is_discontinued) return <span className="pm-badge badge-disc">DISC</span>;
  if (row.is_active === false) return <span className="pm-badge badge-inactive">OFF</span>;
  return <span className="pm-badge badge-active">ON</span>;
}
function Toggle({ checked, onChange }) {
  return (
    <label className="pm-toggle">
      <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} />
      <span className="pm-toggle-slider" />
    </label>
  );
}
function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, []);
  return <div className={`pm-toast ${type}`}>{msg}</div>;
}

// ─── Column layout — products ─────────────────────────────────────────────────
// Widths must sum to 100% of the list container.
// Keep in sync with pm-vt-head-cell widths below.
const COLS = [
  { key: 'check',   label: '',         width: 40,  fixed: true },
  { key: 'img',     label: '',         width: 44,  fixed: true },
  { key: 'sku',     label: 'SKU',      width: 120, fixed: true },
  { key: 'name',    label: 'Name',     flex: 2,    editable: true },
  { key: 'brand',   label: 'Brand',    flex: 1,    editable: true },
  { key: 'category',label: 'Category', flex: 1,    editable: true },
  { key: 'vendor',  label: 'Vendor',   width: 80,  fixed: true },
  { key: 'price',   label: 'Price',    width: 80,  fixed: true, editable: true },
  { key: 'pack_qty',label: 'Pack',     width: 56,  fixed: true, editable: true },
  { key: 'stock',   label: 'Stock',    width: 68,  fixed: true },
  { key: 'status',  label: 'Status',   width: 72,  fixed: true },
  { key: 'fitment', label: 'Fitment',  width: 76,  fixed: true },
  { key: 'actions', label: '',         width: 60,  fixed: true },
];

// ─── Inline cell editor ───────────────────────────────────────────────────────
function InlineEditor({ value, onCommit, onCancel }) {
  const [val, setVal] = useState(value ?? '');
  const ref = useRef(null);
  useEffect(() => { ref.current?.select(); }, []);
  const commit = () => onCommit(val);
  return (
    <input
      ref={ref}
      className="pm-inline-input"
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter')  commit();
        if (e.key === 'Escape') onCancel();
        e.stopPropagation();
      }}
      onClick={e => e.stopPropagation()}
    />
  );
}

// ─── Virtualized Products Table (native scroll, no external deps) ─────────────
// Renders only the rows visible in the scroll window + overscan.
// No react-window needed — pure CSS overflow + scrollTop math.
const OVERSCAN = 6;

function ProductsTable({ products, selected, onToggleSelect, onToggleAll, onEdit, onInlineSave, onToast }) {
  const [editingCell, setEditingCell] = useState(null);
  const [scrollTop, setScrollTop]     = useState(0);
  const containerRef                  = useRef(null);
  const containerHeight               = 560; // px — fixed viewport height

  const startEdit  = (id, col, val) => setEditingCell({ id, col, val });
  const cancelEdit = () => setEditingCell(null);

  const commitEdit = async (product, col, val) => {
    setEditingCell(null);
    if (String(val) === String(product[col] ?? '')) return;
    try {
      const body = { [col]: col === 'price' ? (parseFloat(val) || null) : col === 'pack_qty' ? (Math.max(1, parseInt(val, 10) || 1)) : val };
      const res  = await fetch(`/api/admin/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) { onInlineSave({ ...product, ...body }); onToast(`Saved ${col}`, 'ok'); }
      else { onToast('Save failed', 'err'); }
    } catch { onToast('Save failed', 'err'); }
  };

  const allSelected  = products.length > 0 && selected.size === products.length;
  const totalHeight  = products.length * ROW_HEIGHT;
  const firstVisible = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const lastVisible  = Math.min(products.length - 1, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN);
  const visibleItems = [];
  for (let i = firstVisible; i <= lastVisible; i++) visibleItems.push(i);

  // Dummy widths — flex layout handles actual sizing
  const FIXED_WIDTHS = [40, 44, 120, 0, 0, 0, 80, 80, 56, 68, 72, 76, 60];

  return (
    <div className="pm-vt-wrap">
      {/* Sticky header */}
      <div className="pm-vt-head" style={{ display: 'flex' }}>
        {COLS.map((col, i) => (
          <div
            key={col.key}
            className="pm-vt-head-cell"
            style={{
              ...(col.fixed ? { width: FIXED_WIDTHS[i], flexShrink: 0 } : { flex: col.flex, minWidth: 80 }),
              ...(col.key === 'check' ? { justifyContent: 'center', display: 'flex' } : {}),
            }}
          >
            {col.key === 'check'
              ? <input type="checkbox" checked={allSelected} onChange={onToggleAll} style={{ accentColor: 'var(--accent)', width: 13, height: 13, cursor: 'pointer' }} />
              : col.label}
            {col.editable && col.label ? <span style={{ color: 'var(--border2)', marginLeft: 4, fontSize: 9 }}>✎</span> : null}
          </div>
        ))}
      </div>

      {/* Scroll container */}
      <div
        ref={containerRef}
        onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
        style={{ height: containerHeight, overflowY: 'auto', position: 'relative' }}
      >
        {/* Spacer to give correct total scroll height */}
        <div style={{ height: totalHeight, position: 'relative' }}>
          {visibleItems.map(i => {
            const p    = products[i];
            const isSel = selected.has(p.id);

            const editCell = (colKey, content) => {
              const col = COLS.find(c => c.key === colKey);
              const isEditing = editingCell?.id === p.id && editingCell?.col === colKey;
              return (
                <div
                  className={`pm-vt-cell${col?.editable ? ' editable' : ''}`}
                  style={{ flex: col?.flex, minWidth: col?.flex ? 80 : undefined, width: !col?.flex ? FIXED_WIDTHS[COLS.indexOf(col)] : undefined, flexShrink: col?.fixed ? 0 : undefined }}
                  onDoubleClick={col?.editable ? () => startEdit(p.id, colKey, p[colKey]) : undefined}
                >
                  {isEditing
                    ? <InlineEditor value={editingCell.val} onCommit={v => commitEdit(p, colKey, v)} onCancel={cancelEdit} />
                    : content}
                </div>
              );
            };

            return (
              <div
                key={p.id}
                className={`pm-vt-row${isSel ? ' selected' : ''}`}
                style={{
                  position: 'absolute', top: i * ROW_HEIGHT, left: 0, right: 0,
                  height: ROW_HEIGHT, display: 'flex', alignItems: 'center',
                  background: isSel ? 'rgba(255,77,0,0.06)' : i % 2 === 0 ? 'var(--surface)' : 'var(--bg)',
                }}
              >
                {/* Check */}
                <div className="pm-vt-cell" style={{ width: 40, flexShrink: 0, justifyContent: 'center' }}>
                  <input type="checkbox" checked={isSel} onChange={() => onToggleSelect(p.id)} style={{ accentColor: 'var(--accent)', width: 13, height: 13, cursor: 'pointer' }} />
                </div>
                {/* Image */}
                <div className="pm-vt-cell" style={{ width: 44, flexShrink: 0, justifyContent: 'center' }}>
                  {p.image_url ? <img className="pm-img-thumb" src={p.image_url} alt="" loading="lazy" /> : <div className="pm-img-ph">○</div>}
                </div>
                {/* SKU */}
                <div className="pm-vt-cell" style={{ width: 120, flexShrink: 0 }}>
                  <span style={{ color: 'var(--muted)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.sku}</span>
                </div>
                {/* Name — editable */}
                {editCell('name', <span style={{ overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',width:'100%',display:'block',fontWeight:500 }} title={p.name}>{p.name}</span>)}
                {/* Brand — editable */}
                {editCell('brand', <span style={{ overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',width:'100%',display:'block',color:'var(--muted)' }} title={p.brand}>{p.brand||'—'}</span>)}
                {/* Category — editable */}
                {editCell('category', <span style={{ overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',width:'100%',display:'block',color:'var(--muted)' }} title={p.category}>{p.category||'—'}</span>)}
                {/* Vendor */}
                <div className="pm-vt-cell" style={{ width: 80, flexShrink: 0 }}>{vendorBadge(p.source_vendor)}</div>
                {/* Price — editable */}
                {editCell('price', <span>{p.price!=null?`$${Number(p.price).toFixed(2)}`:'—'}</span>)}
                {/* Pack qty — editable */}
                {editCell('pack_qty', <span style={{ color: (p.pack_qty ?? 1) > 1 ? 'var(--text)' : 'var(--muted)' }}>{(p.pack_qty ?? 1) > 1 ? `${p.pack_qty}×` : '1×'}</span>)}
                {/* Stock */}
                <div className="pm-vt-cell" style={{ width: 68, flexShrink: 0 }}>
                  <span style={{ fontSize:11, color: p.stock_quantity>10?'var(--green)':p.stock_quantity>0?'var(--yellow)':'var(--muted)' }}>{p.stock_quantity??0}</span>
                </div>
                {/* Status */}
                <div className="pm-vt-cell" style={{ width: 72, flexShrink: 0 }}>{statusBadge(p)}</div>
                {/* Fitment */}
                <div className="pm-vt-cell" style={{ width: 76, flexShrink: 0 }}>
                  <span style={{ fontSize:10, color: p.fitment_count>0?'var(--green)':'var(--muted)' }}>{p.fitment_count>0?`${p.fitment_count}`:'—'}</span>
                </div>
                {/* Edit */}
                <div className="pm-vt-cell" style={{ width: 60, flexShrink: 0, justifyContent: 'center' }}>
                  <button className="pm-edit-btn" onClick={() => onEdit(p)}>Edit</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Fitment Data Tab ─────────────────────────────────────────────────────────
function FitmentDataTab({ onToast }) {
  const [rows, setRows]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [search, setSearch]   = useState('');
  const [loading, setLoading] = useState(false);
  const debRef = useRef(null);

  const load = useCallback(async (p = 1, q = search) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, limit: FIT_PAGE_SIZE });
      if (q) params.set('q', q);
      const res = await fetch(`/api/admin/fitment?${params}`);
      const d   = await res.json();
      setRows(d.rows || []);
      setTotal(d.total || 0);
      setPage(p);
    } catch { onToast('Failed to load fitment', 'err'); }
    finally  { setLoading(false); }
  }, [search]);

  useEffect(() => { load(1); }, []);

  const handleSearch = val => {
    setSearch(val);
    clearTimeout(debRef.current);
    debRef.current = setTimeout(() => load(1, val), 350);
  };

  const deleteRow = async (id) => {
    const res = await fetch(`/api/admin/fitment/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setRows(r => r.filter(x => x.id !== id));
      setTotal(t => t - 1);
      onToast('Fitment row deleted', 'ok');
    } else {
      onToast('Delete failed', 'err');
    }
  };

  const totalPages = Math.ceil(total / FIT_PAGE_SIZE);

  return (
    <div>
      <div className="pm-filters" style={{ marginBottom: 12 }}>
        <input
          className="pm-search"
          placeholder="Search product ID, model, family, year…"
          value={search}
          onChange={e => handleSearch(e.target.value)}
        />
        <span style={{ color: 'var(--muted)', fontSize: 11 }}>{total.toLocaleString()} rows</span>
      </div>

      <div className="pm-vt-wrap">
        {loading ? (
          <div className="pm-loading"><div className="pm-spinner" /><br />Loading fitment…</div>
        ) : rows.length === 0 ? (
          <div className="pm-empty">No fitment rows found.</div>
        ) : (
          <table className="pm-fit-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Product ID</th>
                <th>SKU</th>
                <th>Name</th>
                <th>Family</th>
                <th>Model</th>
                <th>Year</th>
                <th>Source</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={{ color: 'var(--muted)', fontSize: 11 }}>{r.id}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 11 }}>{r.product_id}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 11 }}>{r.sku}</td>
                  <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.name}>{r.name || '—'}</td>
                  <td>{r.family_name || '—'}</td>
                  <td style={{ fontSize: 11 }}>{r.model_code || r.model_name || '—'}</td>
                  <td style={{ color: 'var(--accent2)' }}>{r.year}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 11 }}>{r.fitment_source || '—'}</td>
                  <td>
                    <button className="pm-fitment-del" onClick={() => deleteRow(r.id)} title="Delete row">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!loading && totalPages > 1 && (
          <div className="pm-pagination">
            <span className="pm-page-info">{((page-1)*FIT_PAGE_SIZE)+1}–{Math.min(page*FIT_PAGE_SIZE, total)} of {total.toLocaleString()}</span>
            <div className="pm-page-btns">
              <button className="pm-btn" onClick={() => load(page-1)} disabled={page === 1}>← Prev</button>
              <button className="pm-btn" onClick={() => load(page+1)} disabled={page >= totalPages}>Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function EditModal({ product, families, onClose, onSaved, onToast }) {
  const [tab, setTab]   = useState('content');
  const [form, setForm] = useState({
    name:            product.name            || '',
    description:     product.description     || '',
    brand:           product.brand           || '',
    category:        product.category        || '',
    msrp:            product.msrp            != null ? String(product.msrp)     : '',
    map_price:       product.map_price       != null ? String(product.map_price): '',
    pack_qty:        product.pack_qty        != null ? String(product.pack_qty) : '1',
    is_active:       product.is_active       !== false,
    is_discontinued: !!product.is_discontinued,
    is_harley_fitment: !!product.is_harley_fitment,
    is_universal:    !!product.is_universal,
    has_map_policy:  !!product.has_map_policy,
    features:        Array.isArray(product.features) ? product.features : [],
    // era flags
    ...ERA_FLAGS.reduce((acc, f) => ({ ...acc, [f.key]: !!product[f.key] }), {}),
  });
  const [images, setImages]         = useState(Array.isArray(product.image_urls) ? product.image_urls : product.image_url ? [product.image_url] : []);
  const [fitment, setFitment]       = useState([]);
  const [fitLoading, setFitLoading] = useState(true);
  const [saving, setSaving]         = useState(false);
  const [newFamily, setNewFamily]   = useState('');
  const [models, setModels]         = useState([]);
  const [newModel, setNewModel]     = useState('');
  const [years, setYears]           = useState([]);
  const [newYear, setNewYear]       = useState('');

  useEffect(() => {
    fetch(`/api/admin/products/${product.id}/fitment`)
      .then(r => r.json())
      .then(d => setFitment(d.fitment || []))
      .catch(() => {})
      .finally(() => setFitLoading(false));
  }, [product.id]);

  useEffect(() => {
    if (!newFamily) { setModels([]); setNewModel(''); setYears([]); setNewYear(''); return; }
    fetch(`/api/fitment/models?family=${encodeURIComponent(newFamily)}`)
      .then(r => r.json())
      .then(d => { setModels(d.models || []); setNewModel(''); setYears([]); setNewYear(''); })
      .catch(() => {});
  }, [newFamily]);

  useEffect(() => {
    if (!newModel) { setYears([]); setNewYear(''); return; }
    fetch(`/api/fitment/years?model=${encodeURIComponent(newModel)}`)
      .then(r => r.json())
      .then(d => { setYears(d.years || []); setNewYear(''); })
      .catch(() => {});
  }, [newModel]);

  const setField    = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setFeature  = (i, val) => { const a = [...form.features]; a[i] = val; setField('features', a); };
  const addFeature  = () => setField('features', [...form.features, '']);
  const delFeature  = i  => setField('features', form.features.filter((_, j) => j !== i));

  const addFitment = async () => {
    if (!newFamily || !newModel || !newYear) return;
    const res = await fetch(`/api/admin/products/${product.id}/fitment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ family: newFamily, model: newModel, year: parseInt(newYear) }),
    });
    if (res.ok) {
      const d = await res.json();
      setFitment(d.fitment || []);
      onToast('Fitment added', 'ok');
    } else { onToast('Failed to add fitment', 'err'); }
  };

  const delFitment = async (fitmentId) => {
    const res = await fetch(`/api/admin/products/${product.id}/fitment?fitment_id=${fitmentId}`, { method: 'DELETE' });
    if (res.ok) { setFitment(f => f.filter(r => r.id !== fitmentId)); onToast('Fitment removed', 'ok'); }
    else { onToast('Failed to remove fitment', 'err'); }
  };

  const delImage = (idx) => setImages(imgs => imgs.filter((_, i) => i !== idx));

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        name:              form.name,
        description:       form.description,
        brand:             form.brand,
        category:          form.category,
        msrp:              form.msrp !== '' ? parseFloat(form.msrp) : null,
        map_price:         form.map_price !== '' ? parseFloat(form.map_price) : null,
        pack_qty:          Math.max(1, parseInt(form.pack_qty, 10) || 1),
        features:          form.features.filter(Boolean),
        is_active:         form.is_active,
        is_discontinued:   form.is_discontinued,
        is_harley_fitment: form.is_harley_fitment,
        is_universal:      form.is_universal,
        has_map_policy:    form.has_map_policy,
        ...ERA_FLAGS.reduce((acc, f) => ({ ...acc, [f.key]: form[f.key] }), {}),
      };
      const res = await fetch(`/api/admin/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        onToast('Saved', 'ok');
        onSaved({ ...product, ...body });
        onClose();
      } else { onToast('Save failed', 'err'); }
    } finally { setSaving(false); }
  };

  const TABS = [
    { key: 'content',  label: 'Content' },
    { key: 'pricing',  label: 'Pricing & Flags' },
    { key: 'era',      label: 'Era / Fitment Flags' },
    { key: 'fitment',  label: `Fitment (${fitment.length})` },
    { key: 'images',   label: `Images (${images.length})` },
  ];

  return (
    <div className="pm-modal-bg" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pm-modal wide">
        <div className="pm-modal-header">
          <span className="pm-modal-title">Edit — {product.sku}</span>
          <button className="pm-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="pm-modal-body">

          {/* Modal tabs */}
          <div className="pm-modal-tabs">
            {TABS.map(t => (
              <button key={t.key} className={`pm-modal-tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Content tab */}
          {tab === 'content' && (
            <>
              <div className="pm-row2">
                <div className="pm-field">
                  <label className="pm-label">Name</label>
                  <input className="pm-input" value={form.name} onChange={e => setField('name', e.target.value)} />
                </div>
                <div className="pm-field">
                  <label className="pm-label">Brand</label>
                  <input className="pm-input" value={form.brand} onChange={e => setField('brand', e.target.value)} />
                </div>
              </div>
              <div className="pm-field">
                <label className="pm-label">Category</label>
                <input className="pm-input" value={form.category} onChange={e => setField('category', e.target.value)} />
              </div>
              <div className="pm-field">
                <label className="pm-label">Description</label>
                <textarea className="pm-textarea" value={form.description} onChange={e => setField('description', e.target.value)} />
              </div>
              <div className="pm-field">
                <label className="pm-label">Features</label>
                <div className="pm-features-list">
                  {form.features.map((f, i) => (
                    <div key={i} className="pm-feature-row">
                      <input className="pm-input" value={f} onChange={e => setFeature(i, e.target.value)} placeholder={`Feature ${i+1}`} />
                      <button className="pm-feature-del" onClick={() => delFeature(i)}>×</button>
                    </div>
                  ))}
                </div>
                <button className="pm-btn" onClick={addFeature}>+ Add Feature</button>
              </div>
            </>
          )}

          {/* Pricing & Flags tab */}
          {tab === 'pricing' && (
            <>
              <div className="pm-section-title">Pricing</div>
              <div className="pm-row3">
                <div className="pm-field">
                  <label className="pm-label">MSRP</label>
                  <input className="pm-input" type="number" step="0.01" value={form.msrp} onChange={e => setField('msrp', e.target.value)} placeholder="0.00" />
                </div>
                <div className="pm-field">
                  <label className="pm-label">MAP Price</label>
                  <input className="pm-input" type="number" step="0.01" value={form.map_price} onChange={e => setField('map_price', e.target.value)} placeholder="0.00" />
                </div>
                <div className="pm-field">
                  <label className="pm-label">Pack Qty</label>
                  <input className="pm-input" type="number" step="1" min="1" value={form.pack_qty} onChange={e => setField('pack_qty', e.target.value)} placeholder="1" />
                  <div className="pm-toggle-sub" style={{ marginTop: 4 }}>Units per listing — shown on PDP as &quot;Pack of N&quot;</div>
                </div>
              </div>
              <hr className="pm-divider" />
              <div className="pm-section-title">Status Flags</div>
              {[
                { key: 'is_active',         label: 'Active',            sub: 'Visible in shop and search' },
                { key: 'is_discontinued',   label: 'Discontinued',      sub: 'Marked as no longer available' },
                { key: 'has_map_policy',    label: 'MAP Policy',        sub: 'Minimum advertised price enforced' },
                { key: 'is_harley_fitment', label: 'Harley Fitment',    sub: 'Tagged as HD-specific part' },
                { key: 'is_universal',      label: 'Universal Fit',     sub: 'Fits all / not model-specific' },
              ].map(({ key, label, sub }) => (
                <div key={key} className="pm-toggle-row">
                  <div className="pm-toggle-label">
                    <div>{label}</div>
                    <div className="pm-toggle-sub">{sub}</div>
                  </div>
                  <Toggle checked={form[key]} onChange={v => setField(key, v)} />
                </div>
              ))}
            </>
          )}

          {/* Era flags tab */}
          {tab === 'era' && (
            <>
              <div className="pm-section-title">Era Columns (catalog_unified)</div>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.6 }}>
                These are the era_* boolean columns. Changing them here updates catalog_unified directly.
                Run the era backfill SQL after bulk fitment changes to re-derive these automatically.
              </p>
              <div className="pm-era-grid">
                {ERA_FLAGS.map(f => (
                  <label key={f.key} className={`pm-era-pill${form[f.key] ? ' on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={!!form[f.key]}
                      onChange={e => setField(f.key, e.target.checked)}
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            </>
          )}

          {/* Fitment tab */}
          {tab === 'fitment' && (
            <>
              <div className="pm-section-title">Assigned Fitment</div>
              {fitLoading ? (
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>Loading…</div>
              ) : (
                <>
                  {fitment.length === 0 && (
                    <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 12 }}>No fitment assigned.</div>
                  )}
                  <div className="pm-fitment-list">
                    {fitment.map(r => (
                      <div key={r.id} className="pm-fitment-row">
                        <span>{r.year} — {r.family_name} / {r.model_name}</span>
                        <button className="pm-fitment-del" onClick={() => delFitment(r.id)}>×</button>
                      </div>
                    ))}
                  </div>
                  <div className="pm-section-title" style={{ marginTop: 16 }}>Add Fitment Row</div>
                  <div className="pm-fitment-add">
                    <div>
                      <label className="pm-label">Family</label>
                      <select className="pm-select" style={{ width: '100%' }} value={newFamily} onChange={e => setNewFamily(e.target.value)}>
                        <option value="">— Family —</option>
                        {families.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="pm-label">Model</label>
                      <select className="pm-select" style={{ width: '100%' }} value={newModel} onChange={e => setNewModel(e.target.value)} disabled={!models.length}>
                        <option value="">— Model —</option>
                        {models.map(m => <option key={m.id} value={m.id}>{m.model_code} — {m.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="pm-label">Year</label>
                      <select className="pm-select" style={{ width: '100%' }} value={newYear} onChange={e => setNewYear(e.target.value)} disabled={!years.length}>
                        <option value="">— Year —</option>
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                    <button className="pm-btn accent" onClick={addFitment} disabled={!newFamily || !newModel || !newYear}>Add</button>
                  </div>
                </>
              )}
            </>
          )}

          {/* Images tab */}
          {tab === 'images' && (
            <>
              <div className="pm-section-title">Images</div>
              {images.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 12 }}>No images.</div>
              ) : (
                <div className="pm-img-grid">
                  {images.map((url, i) => (
                    <div key={i} className="pm-img-item">
                      <img src={url} alt={`img ${i+1}`} loading="lazy" />
                      <button className="pm-img-del" onClick={() => delImage(i)}>×</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="pm-field" style={{ marginTop: 12 }}>
                <label className="pm-label">Add Image URL</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="pm-input"
                    placeholder="https://…"
                    id="new-img-url"
                  />
                  <button className="pm-btn" onClick={() => {
                    const el = document.getElementById('new-img-url');
                    const v  = el?.value?.trim();
                    if (v) { setImages(imgs => [...imgs, v]); el.value = ''; }
                  }}>Add</button>
                </div>
              </div>
            </>
          )}

        </div>

        <div className="pm-modal-footer">
          <button className="pm-btn" onClick={onClose}>Cancel</button>
          <button className="pm-btn accent" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Bulk Fitment Modal ───────────────────────────────────────────────────────
function BulkFitmentModal({ count, families, onClose, onDone, onToast }) {
  const [newFamily, setNewFamily] = useState('');
  const [models, setModels]       = useState([]);
  const [newModel, setNewModel]   = useState('');
  const [years, setYears]         = useState([]);
  const [newYear, setNewYear]     = useState('');
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    if (!newFamily) { setModels([]); setNewModel(''); setYears([]); setNewYear(''); return; }
    fetch(`/api/fitment/models?family=${encodeURIComponent(newFamily)}`).then(r => r.json()).then(d => { setModels(d.models || []); setNewModel(''); }).catch(() => {});
  }, [newFamily]);

  useEffect(() => {
    if (!newModel) { setYears([]); setNewYear(''); return; }
    fetch(`/api/fitment/years?model=${encodeURIComponent(newModel)}`).then(r => r.json()).then(d => { setYears(d.years || []); setNewYear(''); }).catch(() => {});
  }, [newModel]);

  const apply = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/products/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fitment', family: newFamily, model: newModel, year: parseInt(newYear) }),
      });
      if (res.ok) { onToast('Fitment assigned', 'ok'); onDone(); onClose(); }
      else { onToast('Bulk fitment failed', 'err'); }
    } finally { setSaving(false); }
  };

  return (
    <div className="pm-modal-bg" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pm-modal narrow">
        <div className="pm-modal-header">
          <span className="pm-modal-title">Assign Fitment — {count} products</span>
          <button className="pm-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="pm-modal-body">
          {[{label:'Family',val:newFamily,set:setNewFamily,opts:families.map(f=>({id:f.name,label:f.name}))},
            {label:'Model', val:newModel, set:setNewModel, opts:models.map(m=>({id:m.id,label:`${m.model_code} — ${m.name}`})), disabled:!models.length},
            {label:'Year',  val:newYear,  set:setNewYear,  opts:years.map(y=>({id:y,label:y})), disabled:!years.length},
          ].map(({label,val,set,opts,disabled}) => (
            <div key={label} className="pm-field">
              <label className="pm-label">{label}</label>
              <select className="pm-select" style={{width:'100%'}} value={val} onChange={e=>set(e.target.value)} disabled={disabled}>
                <option value="">— {label} —</option>
                {opts.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div className="pm-modal-footer">
          <button className="pm-btn" onClick={onClose}>Cancel</button>
          <button className="pm-btn accent" onClick={apply} disabled={saving||!newFamily||!newModel||!newYear}>
            {saving ? 'Applying…' : 'Apply to Selected'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────
function ConfirmModal({ title, message, confirmLabel, confirmClass, onConfirm, onClose }) {
  return (
    <div className="pm-modal-bg" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pm-modal narrow">
        <div className="pm-modal-header">
          <span className="pm-modal-title">{title}</span>
          <button className="pm-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="pm-modal-body">
          <p className="pm-confirm-msg" dangerouslySetInnerHTML={{ __html: message }} />
        </div>
        <div className="pm-modal-footer">
          <button className="pm-btn" onClick={onClose}>Cancel</button>
          <button className={`pm-btn ${confirmClass || 'accent'}`} onClick={onConfirm}>{confirmLabel || 'Confirm'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ProductManager({ brands, categories, vendorCounts, families }) {
  const [dataTab, setDataTab]   = useState('products'); // 'products' | 'fitment'
  const [products, setProducts] = useState([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(false);
  const [search, setSearch]     = useState('');
  const [vendor, setVendor]     = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand]       = useState('');
  const [selected, setSelected] = useState(new Set());
  const [editProd, setEditProd] = useState(null);
  const [toast, setToast]       = useState(null);
  const [modal, setModal]       = useState(null);

  const debRef     = useRef(null);
  const searchRef  = useRef(null);

  const showToast = (msg, type = 'ok') => setToast({ msg, type });

  const load = useCallback(async (p = 1, q = search, v = vendor, c = category, b = brand) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, limit: PAGE_SIZE });
      if (q) params.set('q', q);
      if (v) params.set('vendor', v);
      if (c) params.set('category', c);
      if (b) params.set('brand', b);
      const res = await fetch(`/api/admin/products?${params}`);
      const d   = await res.json();
      setProducts(d.products || []);
      setTotal(d.total || 0);
      setPage(p);
      setSelected(new Set());
    } catch { showToast('Failed to load products', 'err'); }
    finally  { setLoading(false); }
  }, [search, vendor, category, brand]);

  useEffect(() => { load(1); }, [vendor, category, brand]);

  const handleSearch = val => {
    setSearch(val);
    clearTimeout(debRef.current);
    debRef.current = setTimeout(() => load(1, val, vendor, category, brand), 350);
  };

  const toggleSelect  = id => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll     = () => setSelected(s => s.size === products.length ? new Set() : new Set(products.map(p => p.id)));

  const bulkAction = async (action, extra = {}) => {
    const ids = [...selected];
    if (!ids.length) return;
    const res = await fetch('/api/admin/products/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ids, ...extra }),
    });
    if (res.ok) {
      const d = await res.json();
      showToast(d.message || 'Done', 'ok');
      load(page);
    } else { showToast('Action failed', 'err'); }
  };

  const handleInlineSave = updated => setProducts(ps => ps.map(p => p.id === updated.id ? { ...p, ...updated } : p));
  const handleSaved      = updated => { setProducts(ps => ps.map(p => p.id === updated.id ? { ...p, ...updated } : p)); };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const startRow   = (page - 1) * PAGE_SIZE + 1;
  const endRow     = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="pm-wrap">
      <style>{css}</style>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="pm-header">
        <a href="/admin" className="pm-back">← Admin</a>
        <span className="pm-sep">/</span>
        <h1>Product <span className="pm-header-accent">Manager</span></h1>
        <div style={{ flex: 1 }} />
        {/* Data tab switcher */}
        <div className="pm-tabs">
          <button className={`pm-tab${dataTab === 'products' ? ' active' : ''}`} onClick={() => setDataTab('products')}>
            Products
          </button>
          <button className={`pm-tab${dataTab === 'fitment' ? ' active' : ''}`} onClick={() => setDataTab('fitment')}>
            Fitment Data
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>{total.toLocaleString()}</div>
      </div>

      <div className="pm-body">

        {/* ── PRODUCTS TAB ── */}
        {dataTab === 'products' && (
          <>
            {/* Stats */}
            <div className="pm-stats">
              {(vendorCounts || []).map(v => (
                <div key={v.source_vendor} className="pm-stat">
                  {vendorBadge(v.source_vendor)} <strong>{Number(v.count).toLocaleString()}</strong>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div className="pm-filters">
              <input ref={searchRef} className="pm-search" placeholder="Search name or SKU…" value={search} onChange={e => handleSearch(e.target.value)} />
              <select className="pm-select" value={vendor} onChange={e => { setVendor(e.target.value); }}>
                <option value="">All vendors</option>
                <option value="WPS">WPS</option>
                <option value="PU">Parts Unlimited</option>
                <option value="VTWIN">VTwin</option>
              </select>
              <select className="pm-select" value={category} onChange={e => setCategory(e.target.value)}>
                <option value="">All categories</option>
                {(categories || []).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className="pm-select" value={brand} onChange={e => setBrand(e.target.value)}>
                <option value="">All brands</option>
                {(brands || []).map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <button className="pm-btn" onClick={() => { setSearch(''); setVendor(''); setCategory(''); setBrand(''); setTimeout(() => load(1,'','','',''), 0); }}>Clear</button>
            </div>

            {/* Bulk bar */}
            {selected.size > 0 && (
              <div className="pm-bulk-bar">
                <span className="pm-bulk-count">{selected.size}</span>
                <span className="pm-bulk-label">selected — double-click any cell to inline-edit</span>
                <button className="pm-btn success"  onClick={() => bulkAction('activate')}>Activate</button>
                <button className="pm-btn"           onClick={() => bulkAction('deactivate')}>Deactivate</button>
                <button className="pm-btn"           onClick={() => setModal('bulkFitment')}>Assign Fitment</button>
                <button className="pm-btn danger"    onClick={() => setModal('bulkDelete')}>Delete</button>
                <button className="pm-btn"           onClick={() => setSelected(new Set())}>Clear</button>
              </div>
            )}

            {/* Hint when nothing selected */}
            {selected.size === 0 && (
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                Double-click any <span style={{ color: 'var(--text)' }}>Name</span>, <span style={{ color: 'var(--text)' }}>Brand</span>, <span style={{ color: 'var(--text)' }}>Category</span>, or <span style={{ color: 'var(--text)' }}>Price</span> cell to inline-edit. Click <span style={{ color: 'var(--text)' }}>Edit</span> for the full edit modal.
              </div>
            )}

            {/* Virtualized table */}
            {loading ? (
              <div className="pm-vt-wrap" style={{ height: 300 }}>
                <div className="pm-loading"><div className="pm-spinner" /><br />Loading products…</div>
              </div>
            ) : products.length === 0 ? (
              <div className="pm-vt-wrap"><div className="pm-empty">No products found.</div></div>
            ) : (
              <ProductsTable
                products={products}
                selected={selected}
                onToggleSelect={toggleSelect}
                onToggleAll={toggleAll}
                onEdit={setEditProd}
                onInlineSave={handleInlineSave}
                onToast={showToast}
              />
            )}

            {/* Pagination */}
            {!loading && total > PAGE_SIZE && (
              <div className="pm-pagination" style={{ background: 'transparent', border: 'none', paddingLeft: 0, paddingRight: 0, marginTop: 10 }}>
                <span className="pm-page-info">{startRow}–{endRow} of {total.toLocaleString()}</span>
                <div className="pm-page-btns">
                  <button className="pm-btn" onClick={() => load(page-1)} disabled={page===1}>← Prev</button>
                  <button className="pm-btn" onClick={() => load(page+1)} disabled={page>=totalPages}>Next →</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── FITMENT TAB ── */}
        {dataTab === 'fitment' && (
          <FitmentDataTab onToast={showToast} />
        )}
      </div>

      {/* Modals */}
      {editProd && (
        <EditModal product={editProd} families={families || []} onClose={() => setEditProd(null)} onSaved={handleSaved} onToast={showToast} />
      )}
      {modal === 'bulkFitment' && (
        <BulkFitmentModal count={selected.size} families={families || []} onClose={() => setModal(null)} onDone={() => load(page)} onToast={showToast} />
      )}
      {modal === 'bulkDelete' && (
        <ConfirmModal
          title="Delete Products"
          message={`Permanently delete <strong>${selected.size} product${selected.size !== 1 ? 's' : ''}</strong> from catalog_unified. Cannot be undone.`}
          confirmLabel="Delete"
          confirmClass="danger"
          onClose={() => setModal(null)}
          onConfirm={() => { setModal(null); bulkAction('delete'); }}
        />
      )}
    </div>
  );
}
