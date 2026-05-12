"use client";
// app/admin/catalog/CatalogTable.jsx
// Interactive table — category dropdowns, bulk select, save buttons

import { useState, useRef } from "react";
import Link from "next/link";

const CATEGORIES = [
  "General","Engine","Exhaust","Brakes","Suspension","Electrical",
  "Lighting","Handlebars","Hand Controls","Foot Controls","Intake/Carb/Fuel System",
  "Clutch","Drive","Wheels/Tires","Body","Cable/Hydraulic Control Lines",
  "Hardware/Fasteners/Fittings","Chemicals","Apparel/Helmets","Luggage",
  "Gaskets/Seals","Tools","Windshield/Windscreen","Seat","Maintenance",
  "Chopper",
].filter((c, i, a) => a.indexOf(c) === i).sort();

function vendorClass(v) {
  if (v === "PU") return "pill-pu";
  if (v === "WPS") return "pill-wps";
  if (v === "VTWIN") return "pill-vtwin";
  return "";
}

export default function CatalogTable({ initialItems }) {
  const [items, setItems]           = useState(initialItems);
  const [selected, setSelected]     = useState(new Set());
  const [saving, setSaving]         = useState({}); // id → bool
  const [changed, setChanged]       = useState({}); // id → newCategory
  const [toast, setToast]           = useState(null);
  const [bulkCat, setBulkCat]       = useState("");
  const selectAllRef                = useRef(null);

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  function onCatChange(id, value) {
    setChanged(prev => ({ ...prev, [id]: value }));
  }

  async function saveOne(id) {
    const newCat = changed[id];
    if (!newCat) return;
    setSaving(prev => ({ ...prev, [id]: true }));
    try {
      const res = await fetch("/api/admin/catalog/update-category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, category: newCat }),
      });
      if (!res.ok) throw new Error();
      setItems(prev => prev.map(p => p.id === id ? { ...p, category: newCat } : p));
      setChanged(prev => { const n = {...prev}; delete n[id]; return n; });
      showToast("Saved");
    } catch {
      showToast("Save failed", "error");
    } finally {
      setSaving(prev => ({ ...prev, [id]: false }));
    }
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll(checked) {
    if (checked) {
      setSelected(new Set(items.map(p => p.id)));
    } else {
      setSelected(new Set());
    }
  }

  async function bulkSave() {
    if (!bulkCat || selected.size === 0) return;
    const ids = Array.from(selected);
    try {
      const res = await fetch("/api/admin/catalog/bulk-update-category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, category: bulkCat }),
      });
      if (!res.ok) throw new Error();
      setItems(prev => prev.map(p => ids.includes(p.id) ? { ...p, category: bulkCat } : p));
      setChanged(prev => {
        const n = {...prev};
        ids.forEach(id => delete n[id]);
        return n;
      });
      setSelected(new Set());
      setBulkCat("");
      showToast(`Updated ${ids.length} products`);
    } catch {
      showToast("Bulk update failed", "error");
    }
  }

  return (
    <>
      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="bulk-bar">
          <span className="bulk-bar-label">{selected.size} SELECTED</span>
          <select
            className="bulk-select"
            value={bulkCat}
            onChange={e => setBulkCat(e.target.value)}
          >
            <option value="">Move to category…</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="btn" onClick={bulkSave} disabled={!bulkCat}>
            Apply to Selected
          </button>
          <button className="btn btn-ghost" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div className="cm-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{width:"3%"}}>
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  onChange={e => toggleAll(e.target.checked)}
                />
              </th>
              <th style={{width:"30%"}}>Product</th>
              <th style={{width:"14%"}}>Brand</th>
              <th style={{width:"8%"}}>Vendor</th>
              <th style={{width:"6%"}}>Stock</th>
              <th style={{width:"24%"}}>Category</th>
              <th style={{width:"15%"}}></th>
            </tr>
          </thead>
          <tbody>
            {items.length ? items.map(p => {
              const currentCat = changed[p.id] ?? p.category ?? "";
              const isDirty    = changed[p.id] !== undefined && changed[p.id] !== p.category;
              return (
                <tr key={p.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                    />
                  </td>
                  <td>
                    <div className="product-name" title={p.name}>{p.name}</div>
                    <div className="product-sku">{p.internal_sku ?? p.sku}</div>
                  </td>
                  <td className="muted" title={p.brand ?? ""}>{p.brand ?? "—"}</td>
                  <td>
                    <span className={`pill ${vendorClass(p.source_vendor)}`}>
                      {p.source_vendor ?? "—"}
                    </span>
                  </td>
                  <td>
                    <span style={{
                      fontFamily: "var(--font-stencil), monospace",
                      fontSize: "10px",
                      color: (p.stock_quantity ?? 0) > 0 ? "#62d18c" : "#555",
                    }}>
                      {p.stock_quantity ?? 0}
                    </span>
                  </td>
                  <td>
                    <select
                      className={`cat-select ${isDirty ? "changed" : ""}`}
                      value={currentCat}
                      onChange={e => onCatChange(p.id, e.target.value)}
                    >
                      {CATEGORIES.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span style={{display:"flex", gap:6, alignItems:"center"}}>
                      {isDirty && (
                        <button
                          className="save-btn visible"
                          onClick={() => saveOne(p.id)}
                          disabled={saving[p.id]}
                        >
                          {saving[p.id] ? "…" : "Save"}
                        </button>
                      )}
                      <Link
                        href={`/browse/${p.slug}`}
                        target="_blank"
                        style={{fontSize:9, letterSpacing:"0.1em", color:"#444", textDecoration:"none"}}
                      >
                        ↗ View
                      </Link>
                    </span>
                  </td>
                </tr>
              );
            }) : (
              <tr>
                <td colSpan={7} className="muted" style={{textAlign:"center", padding:"32px"}}>
                  No products match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {toast && (
        <div style={{
          position:"fixed", bottom:24, right:24,
          background:"#111010", border:`1px solid ${toast.type === "error" ? "rgba(185,28,28,0.4)" : "rgba(34,197,94,0.35)"}`,
          color: toast.type === "error" ? "#ff7a7a" : "#62d18c",
          padding:"10px 18px", fontFamily:"var(--font-stencil), monospace",
          fontSize:10, letterSpacing:"0.12em", zIndex:300, borderRadius:2,
        }}>
          {toast.msg}
        </div>
      )}
    </>
  );
}
