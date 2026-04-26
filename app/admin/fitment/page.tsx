"use client";

/**
 * app/admin/fitment/page.tsx
 * Admin UI — manage catalog_fitment_v2 assignments per product
 * Also allows editing product category/subcategory
 */

import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductResult {
  id: number;
  sku: string;
  name: string;
  brand: string;
  category: string;
  subcategory: string | null;
  source_vendor: string;
  computed_price: number | null;
  image_url: string | null;
  is_harley_fitment: boolean;
  fits_all_models: boolean;
}

interface FitmentRow {
  id: number;
  family: string;
  model: string;
  model_code: string;
  year: number;
}

interface FitmentGrouped {
  [family: string]: {
    [model: string]: number[];
  };
}

interface HarleyFamily { id: number; name: string; }
interface HarleyModel  { id: number; name: string; model_code: string; family_id: number; }
interface HarleyYear   { id: number; year: number; model_id: number; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ vendor }: { vendor: string }) {
  const colors: Record<string, string> = {
    WPS: "bg-blue-900 text-blue-200",
    PU: "bg-purple-900 text-purple-200",
    VTWIN: "bg-amber-900 text-amber-200",
  };
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded uppercase tracking-wider ${colors[vendor] ?? "bg-zinc-700 text-zinc-300"}`}>
      {vendor}
    </span>
  );
}

function FitmentMatrix({ grouped }: { grouped: FitmentGrouped }) {
  if (!Object.keys(grouped).length) {
    return <p className="text-zinc-500 text-sm italic">No fitment assigned.</p>;
  }
  return (
    <div className="space-y-3">
      {Object.entries(grouped).map(([family, models]) => (
        <div key={family}>
          <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1">{family}</div>
          <div className="space-y-1 pl-3">
            {Object.entries(models).map(([model, years]) => {
              const sorted = [...years].sort((a, b) => a - b);
              const min = sorted[0];
              const max = sorted[sorted.length - 1];
              const isContiguous = sorted.every((y, i) => i === 0 || y === sorted[i - 1] + 1);
              const yearDisplay = isContiguous && sorted.length > 2
                ? `${min}–${max} (${sorted.length} years)`
                : sorted.join(", ");
              return (
                <div key={model} className="flex items-baseline gap-2">
                  <span className="text-xs text-zinc-300 font-mono w-32 shrink-0">{model}</span>
                  <span className="text-xs text-zinc-500">{yearDisplay}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminFitmentPage() {
  // Search
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);
  const [searchResults, setSearchResults] = useState<ProductResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);

  // Selected product
  const [selected, setSelected] = useState<ProductResult | null>(null);

  // Fitment state
  const [fitment, setFitment] = useState<FitmentRow[]>([]);
  const [fitmentGrouped, setFitmentGrouped] = useState<FitmentGrouped>({});
  const [fitmentLoading, setFitmentLoading] = useState(false);

  // Category edit
  const [editCategory, setEditCategory] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [subcategoryDraft, setSubcategoryDraft] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);

  // Harley dropdowns
  const [families, setFamilies] = useState<HarleyFamily[]>([]);
  const [models, setModels] = useState<HarleyModel[]>([]);
  const [years, setYears] = useState<HarleyYear[]>([]);

  // Add fitment form
  const [addFamily, setAddFamily] = useState("");
  const [addModel, setAddModel] = useState("");
  const [addYear, setAddYear] = useState(""); // "all" or a year number
  const [addLoading, setAddLoading] = useState(false);
  const [addMsg, setAddMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Remove fitment
  const [removeLoading, setRemoveLoading] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);

  // ── Load families once ──────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/fitment?type=families")
      .then((r) => r.json())
      .then((d) => setFamilies(d.families ?? []))
      .catch(console.error);
  }, []);

  // ── Load models when family changes ────────────────────────────────────────
  useEffect(() => {
    if (!addFamily) { setModels([]); setAddModel(""); return; }
    const fam = families.find((f) => String(f.id) === addFamily);
    if (!fam) return;
    fetch(`/api/fitment?type=models&make=Harley-Davidson&family=${encodeURIComponent(fam.name)}`)
      .then((r) => r.json())
      .then((d) => setModels(d.models ?? []))
      .catch(console.error);
    setAddModel("");
    setAddYear("");
  }, [addFamily, families]);

  // ── Load years when model changes ──────────────────────────────────────────
  useEffect(() => {
    if (!addModel) { setYears([]); setAddYear(""); return; }
    const mod = models.find((m) => String(m.id) === addModel);
    if (!mod) return;
    fetch(`/api/fitment?type=years&make=Harley-Davidson&model=${encodeURIComponent(mod.model_code)}`)
      .then((r) => r.json())
      .then((d) => setYears(d.years ?? []))
      .catch(console.error);
    setAddYear("");
  }, [addModel, models]);

  // ── Product search ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (debouncedQuery.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    fetch(`/api/admin/products/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then((r) => r.json())
      .then((d) => { setSearchResults(d.results ?? []); setSearchOpen(true); })
      .catch(console.error)
      .finally(() => setSearching(false));
  }, [debouncedQuery]);

  // ── Close dropdown on outside click ────────────────────────────────────────
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // ── Load fitment for selected product ──────────────────────────────────────
  const loadFitment = useCallback(async (productId: number) => {
    setFitmentLoading(true);
    try {
      const r = await fetch(`/api/admin/fitment?productId=${productId}`);
      const d = await r.json();
      setFitment(d.rows ?? []);
      setFitmentGrouped(d.grouped ?? {});
    } catch (e) {
      console.error(e);
    } finally {
      setFitmentLoading(false);
    }
  }, []);

  function selectProduct(p: ProductResult) {
    setSelected(p);
    setCategoryDraft(p.category ?? "");
    setSubcategoryDraft(p.subcategory ?? "");
    setEditCategory(false);
    setSearchOpen(false);
    setQuery(p.sku + " — " + p.name);
    setAddMsg(null);
    loadFitment(p.id);
  }

  // ── Add fitment ─────────────────────────────────────────────────────────────
  async function handleAddFitment() {
    if (!selected || !addFamily || !addModel) return;
    setAddLoading(true);
    setAddMsg(null);

    try {
      let res;
      if (addYear === "all" || !addYear) {
        // Bulk assign all years for this model
        const fam = families.find((f) => String(f.id) === addFamily);
        res = await fetch("/api/admin/fitment/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: selected.id,
            familyId: parseInt(addFamily),
            modelId: parseInt(addModel),
          }),
        });
      } else {
        // Single year — find the model_year id
        const yr = years.find((y) => String(y.year) === addYear);
        if (!yr) { setAddMsg({ ok: false, text: "Year not found" }); setAddLoading(false); return; }
        res = await fetch("/api/admin/fitment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId: selected.id, modelYearIds: [yr.id] }),
        });
      }

      const d = await res.json();
      if (!res.ok) {
        setAddMsg({ ok: false, text: d.error ?? "Error" });
      } else {
        setAddMsg({ ok: true, text: `✓ Added ${d.inserted} row(s), skipped ${d.skipped} duplicates` });
        await loadFitment(selected.id);
      }
    } catch (e: any) {
      setAddMsg({ ok: false, text: e.message });
    } finally {
      setAddLoading(false);
    }
  }

  // ── Remove all fitment ──────────────────────────────────────────────────────
  async function handleRemoveAll() {
    if (!selected) return;
    if (!confirm(`Remove ALL fitment from "${selected.name}"?`)) return;
    setRemoveLoading(true);
    try {
      const res = await fetch("/api/admin/fitment", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: selected.id, all: true }),
      });
      const d = await res.json();
      setAddMsg({ ok: true, text: `✓ Removed ${d.deleted} fitment rows` });
      await loadFitment(selected.id);
    } catch (e: any) {
      setAddMsg({ ok: false, text: e.message });
    } finally {
      setRemoveLoading(false);
    }
  }

  // ── Save category ────────────────────────────────────────────────────────────
  async function handleSaveCategory() {
    if (!selected) return;
    setCategorySaving(true);
    try {
      const res = await fetch(`/api/admin/products/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: categoryDraft, subcategory: subcategoryDraft }),
      });
      const d = await res.json();
      if (!res.ok) {
        alert(d.error ?? "Save failed");
      } else {
        setSelected({ ...selected, category: categoryDraft, subcategory: subcategoryDraft });
        setEditCategory(false);
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setCategorySaving(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  const filteredModels = models; // already filtered by family from API
  const filteredYears = years;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono">
      {/* Header */}
      <div className="border-b border-zinc-800 px-6 py-4 flex items-center gap-4">
        <div className="text-amber-400 font-bold text-lg tracking-tight">⚙ STINKIN' ADMIN</div>
        <div className="text-zinc-600">/</div>
        <div className="text-zinc-300 text-sm">Fitment Manager</div>
        <div className="ml-auto text-zinc-600 text-xs">catalog_fitment_v2</div>
      </div>

      <div className="max-w-6xl mx-auto p-6 space-y-6">

        {/* ── Product Search ── */}
        <div ref={searchRef} className="relative">
          <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-2">Product Search</label>
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 focus-within:border-amber-500 transition-colors">
            <svg className="w-4 h-4 text-zinc-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              className="bg-transparent flex-1 outline-none text-sm text-zinc-100 placeholder-zinc-600"
              placeholder="Search by SKU or product name…"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
              onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
            />
            {searching && <span className="text-xs text-zinc-500 animate-pulse">searching…</span>}
          </div>

          {/* Dropdown */}
          {searchOpen && searchResults.length > 0 && (
            <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-zinc-900 border border-zinc-700 rounded shadow-xl max-h-80 overflow-y-auto">
              {searchResults.map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectProduct(p)}
                  className="w-full text-left px-4 py-3 hover:bg-zinc-800 border-b border-zinc-800 last:border-0 flex items-center gap-3"
                >
                  {p.image_url ? (
                    <img src={p.image_url} alt="" className="w-10 h-10 object-contain bg-zinc-800 rounded shrink-0" />
                  ) : (
                    <div className="w-10 h-10 bg-zinc-800 rounded shrink-0 flex items-center justify-center text-zinc-600 text-xs">IMG</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-100 truncate">{p.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-zinc-500 font-mono">{p.sku}</span>
                      <StatusBadge vendor={p.source_vendor} />
                      <span className="text-xs text-zinc-600">{p.category}</span>
                    </div>
                  </div>
                  {p.is_harley_fitment && (
                    <span className="text-[10px] text-amber-400 font-mono shrink-0">HD</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Selected Product Panel ── */}
        {selected && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Left: Product info + category edit */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-4">
              <div className="flex items-start gap-4">
                {selected.image_url ? (
                  <img src={selected.image_url} alt="" className="w-20 h-20 object-contain bg-zinc-800 rounded shrink-0" />
                ) : (
                  <div className="w-20 h-20 bg-zinc-800 rounded shrink-0 flex items-center justify-center text-zinc-600 text-xs">NO IMG</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-zinc-100 leading-snug">{selected.name}</div>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className="text-xs text-zinc-500 font-mono">{selected.sku}</span>
                    <StatusBadge vendor={selected.source_vendor} />
                    {selected.is_harley_fitment && (
                      <span className="text-[10px] bg-amber-900 text-amber-300 px-1.5 py-0.5 rounded uppercase tracking-wider">HD Fitment</span>
                    )}
                    {selected.fits_all_models && (
                      <span className="text-[10px] bg-green-900 text-green-300 px-1.5 py-0.5 rounded uppercase tracking-wider">Universal</span>
                    )}
                  </div>
                  {selected.computed_price && (
                    <div className="text-sm text-zinc-400 mt-1">${Number(selected.computed_price).toFixed(2)}</div>
                  )}
                </div>
              </div>

              {/* Category */}
              <div className="border-t border-zinc-800 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-zinc-500 uppercase tracking-wider">Category</span>
                  {!editCategory && (
                    <button
                      onClick={() => setEditCategory(true)}
                      className="text-xs text-amber-400 hover:text-amber-300"
                    >
                      Edit
                    </button>
                  )}
                </div>
                {editCategory ? (
                  <div className="space-y-2">
                    <input
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-500"
                      placeholder="Category"
                      value={categoryDraft}
                      onChange={(e) => setCategoryDraft(e.target.value)}
                    />
                    <input
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-500"
                      placeholder="Subcategory (optional)"
                      value={subcategoryDraft}
                      onChange={(e) => setSubcategoryDraft(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveCategory}
                        disabled={categorySaving}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs rounded disabled:opacity-50"
                      >
                        {categorySaving ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={() => { setEditCategory(false); setCategoryDraft(selected.category); setSubcategoryDraft(selected.subcategory ?? ""); }}
                        className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-zinc-300">
                    {selected.category}
                    {selected.subcategory && <span className="text-zinc-500"> / {selected.subcategory}</span>}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Current fitment */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="text-xs text-zinc-500 uppercase tracking-wider">Current Fitment</span>
                  {!fitmentLoading && (
                    <span className="ml-2 text-xs text-zinc-600">({fitment.length} rows)</span>
                  )}
                </div>
                {fitment.length > 0 && (
                  <button
                    onClick={handleRemoveAll}
                    disabled={removeLoading}
                    className="text-xs text-red-500 hover:text-red-400 disabled:opacity-50"
                  >
                    {removeLoading ? "Removing…" : "Remove all"}
                  </button>
                )}
              </div>
              {fitmentLoading ? (
                <div className="text-zinc-500 text-sm animate-pulse">Loading…</div>
              ) : (
                <div className="max-h-60 overflow-y-auto">
                  <FitmentMatrix grouped={fitmentGrouped} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Add Fitment Panel ── */}
        {selected && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-4">Assign Fitment</div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              {/* Family */}
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Family</label>
                <select
                  value={addFamily}
                  onChange={(e) => setAddFamily(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
                >
                  <option value="">Select family…</option>
                  {families.map((f) => (
                    <option key={f.id} value={String(f.id)}>{f.name}</option>
                  ))}
                </select>
              </div>

              {/* Model */}
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Model</label>
                <select
                  value={addModel}
                  onChange={(e) => setAddModel(e.target.value)}
                  disabled={!addFamily}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500 disabled:opacity-40"
                >
                  <option value="">All models in family</option>
                  {filteredModels.map((m) => (
                    <option key={m.id} value={String(m.id)}>{m.name} ({m.model_code})</option>
                  ))}
                </select>
              </div>

              {/* Year */}
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Year</label>
                <select
                  value={addYear}
                  onChange={(e) => setAddYear(e.target.value)}
                  disabled={!addModel}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500 disabled:opacity-40"
                >
                  <option value="all">All years</option>
                  {filteredYears.map((y) => (
                    <option key={y.id} value={String(y.year)}>{y.year}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={handleAddFitment}
                disabled={addLoading || !addFamily}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold rounded disabled:opacity-40 transition-colors"
              >
                {addLoading ? "Assigning…" : "Assign Fitment"}
              </button>
              {addMsg && (
                <span className={`text-sm ${addMsg.ok ? "text-green-400" : "text-red-400"}`}>
                  {addMsg.text}
                </span>
              )}
            </div>

            {/* Bulk hint */}
            <p className="mt-3 text-xs text-zinc-600">
              Leave Model blank to assign all models in the family. Leave Year as "All years" to assign the full year range.
            </p>
          </div>
        )}

        {/* Empty state */}
        {!selected && (
          <div className="text-center py-24 text-zinc-700">
            <div className="text-4xl mb-3">🔧</div>
            <div className="text-sm">Search for a product above to manage its fitment</div>
          </div>
        )}

      </div>
    </div>
  );
}