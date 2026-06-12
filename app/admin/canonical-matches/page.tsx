'use client';

/**
 * app/admin/canonical-matches/page.tsx
 *
 * Review queue for cross-vendor product matches.
 * Access via /admin/canonical-matches?token=YOUR_ADMIN_SECRET
 *
 * Self-contained light theme — overrides the site's global dark mode /
 * uppercase text-transform so this stays readable regardless of global CSS.
 */

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

interface FitmentRange {
  model_code: string;
  year_min: number;
  year_max: number;
  cnt: number;
}

interface ProductSide {
  id: number;
  name: string;
  source_vendor: string;
  internal_sku: string;
  vendor_sku: string | null;
  brand_part: string | null;
  oem_numbers: string[] | null;
  is_kit: boolean;
  computed_price: number;
  image_url: string | null;
  display_category: string;
  display_subcategory: string | null;
  fits_all: boolean;
}

interface Proposal {
  id: number;
  match_reason: string;
  match_score: number;
  shared_oem_number: string;
  status: string;
  a_id: number; a_name: string; a_vendor: string; a_sku: string;
  a_vendor_sku: string | null; a_brand_part: string | null; a_fits_all: boolean;
  a_oem_numbers: string[] | null; a_is_kit: boolean;
  a_price: number; a_image: string | null; a_category: string; a_subcategory: string | null;
  a_canonical_sku: string;
  b_id: number; b_name: string; b_vendor: string; b_sku: string;
  b_vendor_sku: string | null; b_brand_part: string | null; b_fits_all: boolean;
  b_oem_numbers: string[] | null; b_is_kit: boolean;
  b_price: number; b_image: string | null; b_category: string; b_subcategory: string | null;
  b_canonical_sku: string;
}

const VENDOR_COLORS: Record<string, string> = {
  PU:    '#2E6FB8',
  WPS:   '#1E8A6B',
  VTWIN: '#C98A2E',
};

function fitmentLabel(ranges: FitmentRange[] | undefined): string {
  if (!ranges || ranges.length === 0) return 'No fitment data';
  const parts = ranges.map(r => {
    const yr = r.year_min === r.year_max ? `'${String(r.year_min).slice(-2)}` : `'${String(r.year_min).slice(-2)}–'${String(r.year_max).slice(-2)}`;
    return `${r.model_code} ${yr}`;
  });
  if (parts.length <= 3) return parts.join(', ');
  return `${parts.slice(0, 3).join(', ')} (+${parts.length - 3} more)`;
}

function overallYearRange(ranges: FitmentRange[] | undefined): string | null {
  if (!ranges || ranges.length === 0) return null;
  const min = Math.min(...ranges.map(r => r.year_min));
  const max = Math.max(...ranges.map(r => r.year_max));
  return `${min}–${max}`;
}

// Extracts pack/quantity count from a product name, e.g.
// "Drain Plug O-Ring - 25 Pack" → 25, "Lockwasher, 10 pack" → 10,
// "Set of 6" → 6, "Clutch Ramp Assembly" → 1 (default, single unit)
function parsePackQty(name: string): number {
  const patterns = [
    /(\d+)\s*[- ]?pack/i,
    /pack\s*of\s*(\d+)/i,
    /set\s*of\s*(\d+)/i,
    /\((\d+)\)\s*$/,
    /\bx\s*(\d+)\b/i,
  ];
  for (const re of patterns) {
    const m = name.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > 1 && n <= 500) return n;
    }
  }
  return 1;
}

export default function CanonicalMatchesPage() {
  const params = useSearchParams();
  const token  = params.get('token') ?? '';

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [counts, setCounts]       = useState<Record<string, number>>({});
  const [fitment, setFitment]     = useState<Record<number, FitmentRange[]>>({});
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [busyGroups, setBusyGroups] = useState<Set<string>>(new Set());
  const [syncMsgs, setSyncMsgs]   = useState<Record<string, string>>({});
  const [appliedMsg, setAppliedMsg] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm]   = useState<{ vendor_sku: string; brand_part: string; oem_numbers: string; is_kit: boolean; name: string; computed_price: string; image_url: string }>({ vendor_sku: '', brand_part: '', oem_numbers: '', is_kit: false, name: '', computed_price: '', image_url: '' });
  const [saveMsgs, setSaveMsgs]   = useState<Record<number, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ProductSide[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [manualMatchMsg, setManualMatchMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/canonical-matches?token=${encodeURIComponent(token)}&status=pending&limit=200`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setProposals(data.proposals);
        setCounts(data.counts ?? {});
        setFitment(data.fitment ?? {});
        setError(null);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (!token) {
    return (
      <div style={{ padding: 40, fontFamily: 'monospace', background: '#fff', color: '#1a1a1a', minHeight: '100vh' }}>
        Missing ?token= in URL.
      </div>
    );
  }

  // Group proposals by shared_oem_number
  const groups = new Map<string, Proposal[]>();
  for (const p of proposals) {
    const key = p.shared_oem_number;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  async function bulkAction(oem: string, action: 'confirm' | 'reject') {
    setBusyGroups(prev => new Set(prev).add(oem));
    try {
      await fetch('/api/admin/canonical-matches/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, shared_oem_number: oem, action }),
      });
      setProposals(prev => prev.filter(p => p.shared_oem_number !== oem));
    } finally {
      setBusyGroups(prev => {
        const next = new Set(prev);
        next.delete(oem);
        return next;
      });
    }
  }

  async function syncFitment(oem: string, productIds: number[]) {
    setSyncMsgs(prev => ({ ...prev, [oem]: 'Syncing...' }));
    try {
      const res = await fetch('/api/admin/canonical-matches/sync-fitment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, product_ids: productIds }),
      });
      const data = await res.json();
      if (data.error) {
        setSyncMsgs(prev => ({ ...prev, [oem]: `Error: ${data.error}` }));
        return;
      }
      if (data.total_added === 0) {
        setSyncMsgs(prev => ({ ...prev, [oem]: 'Already in sync — no changes needed' }));
      } else {
        setSyncMsgs(prev => ({ ...prev, [oem]: `Added ${data.total_added} fitment rows across ${productIds.length} products` }));
      }
      load();
    } catch (e) {
      setSyncMsgs(prev => ({ ...prev, [oem]: `Error: ${String(e)}` }));
    }
  }

  function startEdit(p: ProductSide) {
    setEditingId(p.id);
    setEditForm({
      vendor_sku: p.vendor_sku ?? '',
      brand_part: p.brand_part ?? '',
      oem_numbers: (p.oem_numbers ?? []).join(', '),
      is_kit: p.is_kit ?? false,
      name: p.name ?? '',
      computed_price: String(p.computed_price ?? ''),
      image_url: p.image_url ?? '',
    });
  }

  async function saveEdit(productId: number) {
    setSaveMsgs(prev => ({ ...prev, [productId]: 'Saving...' }));
    try {
      const oemArray = editForm.oem_numbers
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const priceNum = parseFloat(editForm.computed_price);

      const res = await fetch('/api/admin/canonical-matches/edit-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          product_id: productId,
          vendor_sku: editForm.vendor_sku,
          brand_part_number: editForm.brand_part,
          oem_numbers: oemArray,
          is_kit: editForm.is_kit,
          name: editForm.name,
          computed_price: Number.isFinite(priceNum) ? priceNum : undefined,
          image_url: editForm.image_url,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setSaveMsgs(prev => ({ ...prev, [productId]: `Error: ${data.error}` }));
        return;
      }
      setSaveMsgs(prev => ({ ...prev, [productId]: 'Saved ✓' }));
      setEditingId(null);
      load();
    } catch (e) {
      setSaveMsgs(prev => ({ ...prev, [productId]: `Error: ${String(e)}` }));
    }
  }

  async function runSearch() {
    if (searchQuery.trim().length < 2) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/canonical-matches/search-products?token=${encodeURIComponent(token)}&q=${encodeURIComponent(searchQuery)}&limit=20`);
      const data = await res.json();
      if (data.error) {
        setManualMatchMsg(`Error: ${data.error}`);
        setSearchResults([]);
      } else {
        setSearchResults(data.results.map((r: any) => ({
          id: r.id, name: r.name, source_vendor: r.source_vendor, internal_sku: r.internal_sku,
          vendor_sku: r.vendor_sku, brand_part: r.brand_part_number, oem_numbers: r.oem_numbers,
          is_kit: r.is_kit, computed_price: r.computed_price, image_url: r.image_url,
          display_category: r.display_category, display_subcategory: r.display_subcategory,
          fits_all: false,
        })));
        setManualMatchMsg(null);
      }
    } catch (e) {
      setManualMatchMsg(`Error: ${String(e)}`);
    } finally {
      setSearching(false);
    }
  }

  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function createManualMatch() {
    if (selectedIds.size < 2) {
      setManualMatchMsg('Select at least 2 products');
      return;
    }
    setManualMatchMsg('Creating...');
    try {
      const res = await fetch('/api/admin/canonical-matches/manual-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, product_ids: [...selectedIds] }),
      });
      const data = await res.json();
      if (data.error) {
        setManualMatchMsg(`Error: ${data.error}`);
        return;
      }
      setManualMatchMsg(`Created ${data.created} proposal(s) — scroll down for the new "Manual match" group`);
      setSelectedIds(new Set());
      setSearchResults([]);
      setSearchQuery('');
      load();
    } catch (e) {
      setManualMatchMsg(`Error: ${String(e)}`);
    }
  }

  async function applyMerges() {
    setAppliedMsg('Applying...');
    const res = await fetch('/api/admin/canonical-matches/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    setAppliedMsg(`Merged ${data.merged} of ${data.total_confirmed} confirmed proposals.${data.errors?.length ? ` ${data.errors.length} errors.` : ''}`);
    load();
  }

  return (
    <div
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        background: '#ffffff',
        color: '#1a1a1a',
        textTransform: 'none',
        letterSpacing: 'normal',
        minHeight: '100vh',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px 80px' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, flexWrap: 'wrap', gap: 10 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#1a1a1a', textTransform: 'none' }}>
            Canonical Match Review
          </h1>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#555' }}>
              pending <b>{counts.pending ?? 0}</b> · confirmed <b>{counts.confirmed ?? 0}</b> · applied <b>{counts.applied ?? 0}</b> · rejected <b>{counts.rejected ?? 0}</b>
            </span>
            <button
              onClick={applyMerges}
              style={{
                background: '#c9a84c', border: 'none', color: '#1a1306',
                fontWeight: 700, fontSize: 13, padding: '9px 16px',
                borderRadius: 6, cursor: 'pointer', textTransform: 'none',
              }}
            >
              Apply confirmed merges
            </button>
          </div>
        </div>

        {appliedMsg && (
          <div style={{ fontSize: 13, color: '#1E8A6B', marginBottom: 10, fontWeight: 600 }}>{appliedMsg}</div>
        )}

        <p style={{ fontSize: 13, color: '#666', marginTop: 0, marginBottom: 24, textTransform: 'none' }}>
          Grouped by shared OEM number — <b>{groups.size}</b> groups, <b>{proposals.length}</b> pairs.
          Confirming a group queues the merge — click &quot;Apply confirmed merges&quot; to execute.
          <br />
          <b>Sync fitment</b> copies the combined year/model coverage to every vendor listing in the group, even if you reject the canonical merge.
        </p>

        <div style={{ border: '1px solid #ddd8cc', borderRadius: 10, padding: 14, marginBottom: 24, background: '#fcfbf8' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a', marginBottom: 8, textTransform: 'none' }}>
            Add a match the scan missed
          </div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 10, textTransform: 'none' }}>
            Search by name, vendor SKU, brand part #, or internal SKU. Select 2+ products you recognize as the same part, then create a manual match — it'll appear below as its own group for review/confirm.
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') runSearch(); }}
              placeholder="e.g. clutch ramp, DS194976, 12-0903..."
              style={{ flex: 1, fontSize: 13, padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6 }}
            />
            <button
              onClick={runSearch}
              disabled={searching}
              style={{
                fontSize: 13, padding: '8px 16px', borderRadius: 6,
                border: '1px solid #2E6FB8', background: '#e8f1fb', color: '#1d4f87',
                fontWeight: 600, cursor: searching ? 'default' : 'pointer', textTransform: 'none',
              }}
            >
              {searching ? 'Searching...' : 'Search'}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {searchResults.map(r => {
                const selected = selectedIds.has(r.id);
                return (
                  <div
                    key={r.id}
                    onClick={() => toggleSelect(r.id)}
                    style={{
                      display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer',
                      border: `1px solid ${selected ? '#3B6D11' : '#eee'}`,
                      background: selected ? '#eef7e6' : '#fff',
                      borderRadius: 6, padding: 8,
                    }}
                  >
                    <input type="checkbox" checked={selected} onChange={() => toggleSelect(r.id)} style={{ flexShrink: 0 }} />
                    {r.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.image_url} alt="" style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 4, background: '#fff', border: '1px solid #eee', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 36, height: 36, background: '#f0eee8', borderRadius: 4, flexShrink: 0 }} />
                    )}
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                      color: '#fff', background: VENDOR_COLORS[r.source_vendor] ?? '#888',
                      textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0,
                    }}>
                      {r.source_vendor}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a', flexShrink: 0 }}>${Number(r.computed_price).toFixed(2)}</span>
                    <span style={{ fontSize: 13, color: '#1a1a1a', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'none' }}>{r.name}</span>
                    {r.vendor_sku && (
                      <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#aaa', flexShrink: 0 }}>{r.vendor_sku}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={createManualMatch}
              disabled={selectedIds.size < 2}
              style={{
                fontSize: 13, padding: '8px 16px', borderRadius: 6,
                border: '1px solid #3B6D11', background: selectedIds.size >= 2 ? '#e6f4d9' : '#f0f0f0',
                color: selectedIds.size >= 2 ? '#3B6D11' : '#bbb',
                fontWeight: 700, cursor: selectedIds.size >= 2 ? 'pointer' : 'default', textTransform: 'none',
              }}
            >
              Create match from {selectedIds.size} selected
            </button>
            {manualMatchMsg && (
              <span style={{ fontSize: 12, color: manualMatchMsg.startsWith('Error') ? '#c0392b' : '#1E8A6B', fontWeight: 600, textTransform: 'none' }}>
                {manualMatchMsg}
              </span>
            )}
          </div>
        </div>

        {loading && <div style={{ color: '#666' }}>Loading...</div>}
        {error && <div style={{ color: '#c0392b', fontWeight: 600 }}>{error}</div>}

        {!loading && groups.size === 0 && (
          <div style={{ padding: 48, textAlign: 'center', color: '#999', border: '1px dashed #ccc', borderRadius: 10 }}>
            No pending proposals. {counts.applied ? `${counts.applied} already applied.` : ''}
          </div>
        )}

        {[...groups.entries()].map(([oem, group]) => {
          const productsMap = new Map<number, ProductSide>();
          for (const p of group) {
            productsMap.set(p.a_id, {
              id: p.a_id, name: p.a_name, source_vendor: p.a_vendor, internal_sku: p.a_sku,
              vendor_sku: p.a_vendor_sku, brand_part: p.a_brand_part, fits_all: p.a_fits_all,
              oem_numbers: p.a_oem_numbers, is_kit: p.a_is_kit,
              computed_price: p.a_price, image_url: p.a_image, display_category: p.a_category,
              display_subcategory: p.a_subcategory,
            });
            productsMap.set(p.b_id, {
              id: p.b_id, name: p.b_name, source_vendor: p.b_vendor, internal_sku: p.b_sku,
              vendor_sku: p.b_vendor_sku, brand_part: p.b_brand_part, fits_all: p.b_fits_all,
              oem_numbers: p.b_oem_numbers, is_kit: p.b_is_kit,
              computed_price: p.b_price, image_url: p.b_image, display_category: p.b_category,
              display_subcategory: p.b_subcategory,
            });
          }
          const products = [...productsMap.values()].sort((a, b) => a.source_vendor.localeCompare(b.source_vendor));
          const productIds = products.map(p => p.id);
          const isBusy = busyGroups.has(oem);
          const syncMsg = syncMsgs[oem];

          const fitmentSets = products.map(p => overallYearRange(fitment[p.id]));
          const distinctRanges = new Set(fitmentSets.filter(Boolean));
          const fitmentMismatch = distinctRanges.size > 1;

          const packQtys = products.map(p => parsePackQty(p.name));
          const distinctPackQtys = new Set(packQtys);
          const packMismatch = distinctPackQtys.size > 1;

          return (
            <div key={oem} style={{
              border: '1px solid #ddd8cc', borderRadius: 10, marginBottom: 16, overflow: 'hidden',
              background: '#fff',
            }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 16px', background: '#faf8f3', borderBottom: '1px solid #ddd8cc',
                flexWrap: 'wrap', gap: 8,
              }}>
                <div style={{ fontSize: 13, color: '#555', textTransform: 'none' }}>
                  {oem.startsWith('MANUAL-') ? (
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#534AB7', fontSize: 14 }}>Manual match</span>
                  ) : (
                    <>OEM <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1a1a1a', fontSize: 14 }}>{oem}</span></>
                  )}
                  {' · '}{products.length} vendors · score {group[0].match_score}
                  {fitmentMismatch && (
                    <span style={{
                      marginLeft: 10, fontSize: 11, fontWeight: 700, color: '#9a5a0c',
                      background: '#fbe8cf', padding: '2px 8px', borderRadius: 10,
                    }}>
                      ⚠ fitment differs
                    </span>
                  )}
                  {packMismatch && (
                    <span style={{
                      marginLeft: 6, fontSize: 11, fontWeight: 700, color: '#993C1D',
                      background: '#f5d9cf', padding: '2px 8px', borderRadius: 10,
                    }}>
                      ⚠ pack size differs ({packQtys.map(q => `${q}x`).join(' vs ')})
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {syncMsg && (
                    <span style={{ fontSize: 12, color: syncMsg.startsWith('Error') ? '#c0392b' : '#1E8A6B', fontWeight: 600 }}>
                      {syncMsg}
                    </span>
                  )}
                  <button
                    onClick={() => syncFitment(oem, productIds)}
                    style={{
                      fontSize: 12, padding: '6px 12px', borderRadius: 5,
                      border: '1px solid #2E6FB8', background: '#e8f1fb', color: '#1d4f87',
                      fontWeight: 600, cursor: 'pointer', textTransform: 'none',
                    }}
                  >
                    Sync fitment ↔
                  </button>
                  <button
                    disabled={isBusy}
                    onClick={() => bulkAction(oem, 'reject')}
                    style={{
                      fontSize: 12, padding: '6px 12px', borderRadius: 5,
                      border: '1px solid #ddd', background: '#fff', color: '#993C1D',
                      cursor: isBusy ? 'default' : 'pointer', opacity: isBusy ? 0.5 : 1, textTransform: 'none',
                    }}
                  >
                    Reject all
                  </button>
                  <button
                    disabled={isBusy}
                    onClick={() => bulkAction(oem, 'confirm')}
                    style={{
                      fontSize: 12, padding: '6px 12px', borderRadius: 5,
                      border: '1px solid #3B6D11', background: '#e6f4d9', color: '#3B6D11',
                      fontWeight: 700, cursor: isBusy ? 'default' : 'pointer', opacity: isBusy ? 0.5 : 1, textTransform: 'none',
                    }}
                  >
                    Confirm all ({group.length})
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: 14 }}>
                {products.map(p => {
                  const ranges = fitment[p.id];
                  const isEditing = editingId === p.id;
                  const saveMsg = saveMsgs[p.id];
                  return (
                    <div key={p.id} style={{
                      display: 'flex', gap: 12, alignItems: 'flex-start',
                      border: '1px solid #eee', borderRadius: 8, padding: 12,
                      flex: '1 1 320px', minWidth: 300, background: '#fcfbf8',
                    }}>
                      {p.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image_url} alt="" style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 4, background: '#fff', border: '1px solid #eee', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 56, height: 56, background: '#f0eee8', borderRadius: 4, flexShrink: 0 }} />
                      )}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                            color: '#fff', background: VENDOR_COLORS[p.source_vendor] ?? '#888',
                            textTransform: 'uppercase', letterSpacing: '0.04em',
                          }}>
                            {p.source_vendor}
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>${Number(p.computed_price).toFixed(2)}</span>
                          {parsePackQty(p.name) > 1 && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#534AB7', background: '#eeedfe', padding: '2px 7px', borderRadius: 10 }}>
                              {parsePackQty(p.name)}×
                            </span>
                          )}
                          {p.fits_all && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#1d4f87', background: '#e8f1fb', padding: '2px 7px', borderRadius: 10 }}>
                              UNIVERSAL
                            </span>
                          )}
                          {p.is_kit && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#9a5a0c', background: '#fbe8cf', padding: '2px 7px', borderRadius: 10 }}>
                              KIT
                            </span>
                          )}
                          <button
                            onClick={() => isEditing ? setEditingId(null) : startEdit(p)}
                            style={{
                              marginLeft: 'auto', fontSize: 11, padding: '2px 8px', borderRadius: 5,
                              border: '1px solid #ccc', background: isEditing ? '#eee' : '#fff', color: '#666',
                              cursor: 'pointer', textTransform: 'none',
                            }}
                          >
                            {isEditing ? 'Cancel' : 'Edit'}
                          </button>
                        </div>
                        <div style={{ fontSize: 14, lineHeight: 1.35, color: '#1a1a1a', marginBottom: 4, textTransform: 'none' }}>
                          {p.name}
                        </div>

                        {isEditing ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8, background: '#fff', border: '1px solid #ddd', borderRadius: 6, padding: 10 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
                              Full product edit — use to swap in a different part entirely
                            </div>
                            <label style={{ fontSize: 11, color: '#888' }}>
                              name
                              <input
                                value={editForm.name}
                                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                                style={{ display: 'block', width: '100%', fontSize: 12, padding: '4px 6px', marginTop: 2, border: '1px solid #ccc', borderRadius: 4 }}
                              />
                            </label>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <label style={{ fontSize: 11, color: '#888', flex: '0 0 120px' }}>
                                price
                                <input
                                  value={editForm.computed_price}
                                  onChange={e => setEditForm(f => ({ ...f, computed_price: e.target.value }))}
                                  inputMode="decimal"
                                  style={{ display: 'block', width: '100%', fontFamily: 'monospace', fontSize: 12, padding: '4px 6px', marginTop: 2, border: '1px solid #ccc', borderRadius: 4 }}
                                />
                              </label>
                              <label style={{ fontSize: 11, color: '#888', flex: 1 }}>
                                image_url
                                <input
                                  value={editForm.image_url}
                                  onChange={e => setEditForm(f => ({ ...f, image_url: e.target.value }))}
                                  style={{ display: 'block', width: '100%', fontFamily: 'monospace', fontSize: 11, padding: '4px 6px', marginTop: 2, border: '1px solid #ccc', borderRadius: 4 }}
                                />
                              </label>
                            </div>

                            <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 6, marginBottom: 2 }}>
                              Identifiers
                            </div>
                            <label style={{ fontSize: 11, color: '#888' }}>
                              vendor_sku (used for ordering)
                              <input
                                value={editForm.vendor_sku}
                                onChange={e => setEditForm(f => ({ ...f, vendor_sku: e.target.value }))}
                                style={{ display: 'block', width: '100%', fontFamily: 'monospace', fontSize: 12, padding: '4px 6px', marginTop: 2, border: '1px solid #ccc', borderRadius: 4 }}
                              />
                            </label>
                            <label style={{ fontSize: 11, color: '#888' }}>
                              brand_part_number
                              <input
                                value={editForm.brand_part}
                                onChange={e => setEditForm(f => ({ ...f, brand_part: e.target.value }))}
                                style={{ display: 'block', width: '100%', fontFamily: 'monospace', fontSize: 12, padding: '4px 6px', marginTop: 2, border: '1px solid #ccc', borderRadius: 4 }}
                              />
                            </label>
                            <label style={{ fontSize: 11, color: '#888' }}>
                              oem_numbers (comma-separated)
                              <input
                                value={editForm.oem_numbers}
                                onChange={e => setEditForm(f => ({ ...f, oem_numbers: e.target.value }))}
                                style={{ display: 'block', width: '100%', fontFamily: 'monospace', fontSize: 12, padding: '4px 6px', marginTop: 2, border: '1px solid #ccc', borderRadius: 4 }}
                              />
                            </label>
                            <label style={{ fontSize: 12, color: '#555', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <input
                                type="checkbox"
                                checked={editForm.is_kit}
                                onChange={e => setEditForm(f => ({ ...f, is_kit: e.target.checked }))}
                              />
                              This is a kit/assembly (exclude from future OEM matching)
                            </label>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <button
                                onClick={() => saveEdit(p.id)}
                                style={{
                                  fontSize: 12, padding: '5px 12px', borderRadius: 5,
                                  border: '1px solid #3B6D11', background: '#e6f4d9', color: '#3B6D11',
                                  fontWeight: 700, cursor: 'pointer', textTransform: 'none',
                                }}
                              >
                                Save
                              </button>
                              {saveMsg && (
                                <span style={{ fontSize: 12, color: saveMsg.startsWith('Error') ? '#c0392b' : '#1E8A6B', fontWeight: 600 }}>
                                  {saveMsg}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: '#999', textTransform: 'none' }}>
                              Saving OEM numbers auto-rejects any other pending proposals for this product whose shared OEM is no longer in the list.
                              {p.oem_numbers !== undefined && ' Name/price/image changes also update the canonical listing if this product is still unmerged (1:1).'}
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ fontSize: 12, color: '#888', display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
                              {p.vendor_sku && (
                                <span><span style={{ color: '#bbb' }}>vendor#</span> <span style={{ fontFamily: 'monospace', color: '#555', fontWeight: 600 }}>{p.vendor_sku}</span></span>
                              )}
                              {p.brand_part && p.brand_part !== p.vendor_sku && (
                                <span><span style={{ color: '#bbb' }}>brand_part_number (raw)</span> <span style={{ fontFamily: 'monospace', color: '#c0392b', fontWeight: 600 }}>{p.brand_part}</span></span>
                              )}
                              <span style={{ fontFamily: 'monospace', color: '#aaa' }}>{p.internal_sku}</span>
                            </div>
                            {p.oem_numbers && p.oem_numbers.length > 0 && (
                              <div style={{ fontSize: 11, color: '#999', marginBottom: 4, textTransform: 'none' }}>
                                OEM: <span style={{ fontFamily: 'monospace' }}>{p.oem_numbers.join(', ')}</span>
                              </div>
                            )}
                            {saveMsg && (
                              <div style={{ fontSize: 11, color: '#1E8A6B', fontWeight: 600, marginBottom: 4 }}>{saveMsg}</div>
                            )}
                          </>
                        )}

                        <div style={{ fontSize: 12, color: '#999', marginBottom: 6, textTransform: 'none' }}>
                          {p.display_category}{p.display_subcategory ? ` / ${p.display_subcategory}` : ''}
                        </div>
                        <div style={{
                          fontSize: 12, color: ranges ? '#3B6D11' : '#aa6c2c',
                          background: ranges ? '#eef7e6' : '#fbf1e3',
                          border: `1px solid ${ranges ? '#cfe8bd' : '#f3ddbe'}`,
                          borderRadius: 6, padding: '4px 8px', textTransform: 'none',
                        }}>
                          {p.fits_all ? 'Fits all models' : fitmentLabel(ranges)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
