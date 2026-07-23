'use client';

/**
 * app/admin/review-queue/page.tsx
 *
 * The "manual review bucket" — every product Claude or the AdminEditPanel's
 * "Flag Issue" mode has flagged as needing a human call (ambiguous
 * category/subcategory, no clean system to route it to, etc), instead of
 * being silently left in a probably-wrong bucket or force-classified.
 * Access via /admin/review-queue?token=YOUR_ADMIN_SECRET
 *
 * Flags split into two families that need different bulk actions:
 *   - category-family (wrong_category, wrong_subcategory, etc.) is backed
 *     directly by catalog_unified -- bulk action can set display_category/
 *     display_subcategory for the whole selection.
 *   - staging-family (flag_type prefixed with oem_ or fitment_) is backed by
 *     oem_crossref_staging / fitment_staging -- bulk action can resolve + reject the underlying
 *     staging row. There's deliberately no bulk "approve" here; promoting
 *     OEM/fitment data at scale without per-row review defeats the point
 *     of the staging/validation gate built this session.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';

interface Flag {
  id: number;
  product_id: number;
  flag_type: string;
  flag_notes: string | null;
  flagged_at: string;
  resolved: boolean;
  resolved_at: string | null;
  name: string;
  sku: string;
  slug: string | null;
  display_category: string | null;
  display_subcategory: string | null;
  source_vendor: string;
}

interface CategoryOption {
  name: string;
  subcategories: { name: string; count: number }[];
}

const FLAG_LABELS: Record<string, string> = {
  wrong_category: 'Wrong category',
  wrong_subcategory: 'Wrong subcategory',
  missing_fitment: 'Missing fitment',
  wrong_fitment: 'Incorrect fitment',
  bad_image: 'Bad / missing image',
  duplicate: 'Possible duplicate',
  oem_conflict: 'OEM# conflict (points to different product)',
  oem_duplicate: 'OEM# already cross-referenced',
  fitment_no_model_match: 'Fitment: unknown model code',
  fitment_ambiguous_model: 'Fitment: ambiguous model code',
  fitment_needs_manual_review: 'Fitment: year range only, model unverified',
  other: 'Other issue',
};

function isStagingFamily(flagType: string) {
  return flagType.startsWith('oem_') || flagType.startsWith('fitment_');
}

export default function ReviewQueuePage() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [status, setStatus] = useState<'unresolved' | 'resolved'>('unresolved');
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [pickCategory, setPickCategory] = useState('');
  const [pickSubcategory, setPickSubcategory] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/review-flags?token=${encodeURIComponent(token)}&status=${status}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setFlags(data.flags ?? []);
        setError(null);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      setSelected(new Set());
    }
  }, [token, status]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch('/api/admin/catalog/categories')
      .then((r) => r.json())
      .then((data) => setCategories(Array.isArray(data.categories) ? data.categories : []))
      .catch(() => setCategories([]));
  }, []);

  async function toggleResolved(flag: Flag) {
    setBusy(prev => new Set(prev).add(flag.id));
    try {
      await fetch(`/api/admin/review-flags?token=${encodeURIComponent(token)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: flag.id, resolved: !flag.resolved }),
      });
      setFlags(prev => prev.filter(f => f.id !== flag.id));
    } finally {
      setBusy(prev => { const next = new Set(prev); next.delete(flag.id); return next; });
    }
  }

  function toggleSelected(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected(prev => (prev.size === flags.length ? new Set() : new Set(flags.map(f => f.id))));
  }

  const selectedFlags = useMemo(() => flags.filter(f => selected.has(f.id)), [flags, selected]);
  const selectedStaging = useMemo(() => selectedFlags.filter(f => isStagingFamily(f.flag_type)), [selectedFlags]);
  const selectedCategoryFamily = useMemo(() => selectedFlags.filter(f => !isStagingFamily(f.flag_type)), [selectedFlags]);

  const subcategoryHints = useMemo(() => {
    const match = categories.find(c => c.name === pickCategory);
    return match ? match.subcategories.map(s => s.name) : [];
  }, [categories, pickCategory]);

  async function bulkResolve() {
    if (selected.size === 0) return;
    setBulkBusy(true);
    setBulkError(null);
    try {
      const res = await fetch(`/api/admin/review-flags/bulk?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flag_ids: [...selected], action: 'resolve' }),
      });
      const data = await res.json();
      if (data.error) { setBulkError(data.error); return; }
      setFlags(prev => prev.filter(f => !selected.has(f.id)));
      setSelected(new Set());
    } catch (e) {
      setBulkError(String(e));
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkRejectStaging() {
    if (selectedStaging.length === 0) return;
    setBulkBusy(true);
    setBulkError(null);
    try {
      const ids = selectedStaging.map(f => f.id);
      const res = await fetch(`/api/admin/review-flags/bulk?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flag_ids: ids, action: 'reject_staging' }),
      });
      const data = await res.json();
      if (data.error) { setBulkError(data.error); return; }
      setFlags(prev => prev.filter(f => !ids.includes(f.id)));
      setSelected(prev => { const next = new Set(prev); ids.forEach(id => next.delete(id)); return next; });
    } catch (e) {
      setBulkError(String(e));
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkSetCategory() {
    if (selectedCategoryFamily.length === 0 || !pickCategory) return;
    setBulkBusy(true);
    setBulkError(null);
    try {
      const ids = selectedCategoryFamily.map(f => f.id);
      const res = await fetch(`/api/admin/review-flags/bulk-category?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flag_ids: ids, display_category: pickCategory, display_subcategory: pickSubcategory || null }),
      });
      const data = await res.json();
      if (data.error) { setBulkError(data.error); return; }
      setFlags(prev => prev.filter(f => !ids.includes(f.id)));
      setSelected(prev => { const next = new Set(prev); ids.forEach(id => next.delete(id)); return next; });
      setPickCategory('');
      setPickSubcategory('');
    } catch (e) {
      setBulkError(String(e));
    } finally {
      setBulkBusy(false);
    }
  }

  if (!token) {
    return (
      <div style={{ padding: 40, fontFamily: 'monospace', background: '#fff', color: '#1a1a1a', minHeight: '100vh' }}>
        Missing ?token= in URL.
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'monospace', background: '#fff', color: '#1a1a1a', minHeight: '100vh', padding: '24px 32px' }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Manual Review Queue</h1>
      <div style={{ fontSize: 13, color: '#666', marginBottom: 20 }}>
        {flags.length} {status} flag{flags.length === 1 ? '' : 's'} — products that need a human call on category/subcategory/fitment/etc, not force-classified.
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['unresolved', 'resolved'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            style={{
              padding: '6px 14px',
              fontFamily: 'monospace',
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              border: '1px solid #ccc',
              background: status === s ? '#1a1a1a' : '#fff',
              color: status === s ? '#fff' : '#1a1a1a',
              cursor: 'pointer',
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {loading && <div>Loading…</div>}
      {error && <div style={{ color: '#b02020' }}>{error}</div>}

      {!loading && !error && flags.length === 0 && (
        <div style={{ color: '#666' }}>Nothing here — queue is empty.</div>
      )}

      {!loading && !error && flags.length > 0 && status === 'unresolved' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={selected.size > 0 && selected.size === flags.length}
              onChange={toggleSelectAll}
            />
            Select all visible ({flags.length})
          </label>
        </div>
      )}

      {selected.size > 0 && (
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            background: '#1a1a1a',
            color: '#fff',
            padding: '12px 16px',
            marginBottom: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13 }}>
              {selected.size} selected
              {selectedStaging.length > 0 && selectedCategoryFamily.length > 0
                ? ` (${selectedStaging.length} staging-backed, ${selectedCategoryFamily.length} category-type)`
                : ''}
            </span>
            <button
              onClick={() => setSelected(new Set())}
              style={{ background: 'none', border: 'none', color: '#ccc', fontSize: 12, cursor: 'pointer' }}
            >
              Clear
            </button>
          </div>

          {bulkError && <div style={{ color: '#ff8080', fontSize: 12 }}>{bulkError}</div>}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={bulkResolve}
              disabled={bulkBusy}
              style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #666', background: '#333', color: '#fff', cursor: bulkBusy ? 'not-allowed' : 'pointer' }}
            >
              Mark resolved ({selected.size})
            </button>

            {selectedStaging.length > 0 && (
              <button
                onClick={bulkRejectStaging}
                disabled={bulkBusy}
                style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #a05050', background: '#5a2c2c', color: '#fff', cursor: bulkBusy ? 'not-allowed' : 'pointer' }}
                title="Marks the flag resolved AND rejects the underlying staged OEM#/fitment row so it stops lingering as 'flagged'. Never promotes/approves data."
              >
                Resolve + reject staging ({selectedStaging.length})
              </button>
            )}

            {selectedCategoryFamily.length > 0 && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select
                  value={pickCategory}
                  onChange={(e) => { setPickCategory(e.target.value); setPickSubcategory(''); }}
                  style={{ padding: '5px 8px', fontSize: 12, fontFamily: 'monospace' }}
                >
                  <option value="">— set category —</option>
                  {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
                <input
                  list="bulk-subcat-hints"
                  value={pickSubcategory}
                  onChange={(e) => setPickSubcategory(e.target.value)}
                  placeholder="subcategory…"
                  disabled={!pickCategory}
                  style={{ padding: '5px 8px', fontSize: 12, fontFamily: 'monospace', width: 160 }}
                />
                <datalist id="bulk-subcat-hints">
                  {subcategoryHints.map(h => <option key={h} value={h} />)}
                </datalist>
                <button
                  onClick={bulkSetCategory}
                  disabled={bulkBusy || !pickCategory}
                  style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #4a7a4a', background: '#2c4a2c', color: '#fff', cursor: (bulkBusy || !pickCategory) ? 'not-allowed' : 'pointer' }}
                >
                  Apply to {selectedCategoryFamily.length}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {flags.map(f => (
          <div
            key={f.id}
            style={{
              border: selected.has(f.id) ? '1px solid #1a1a1a' : '1px solid #ddd',
              background: selected.has(f.id) ? '#faf8f0' : '#fff',
              padding: '12px 14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 16,
            }}
          >
            {status === 'unresolved' && (
              <input
                type="checkbox"
                checked={selected.has(f.id)}
                onChange={() => toggleSelected(f.id)}
                style={{ marginTop: 3 }}
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <span style={{
                  fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em',
                  padding: '2px 8px', background: '#f0e6c8', border: '1px solid #d8c890',
                }}>
                  {FLAG_LABELS[f.flag_type] ?? f.flag_type}
                </span>
                <span style={{ fontSize: 11, color: '#999' }}>{f.source_vendor} · {f.sku}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{f.name}</div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: f.flag_notes ? 4 : 0 }}>
                {f.display_category ?? '—'}{f.display_subcategory ? ` / ${f.display_subcategory}` : ''}
              </div>
              {f.flag_notes && (
                <div style={{ fontSize: 12, color: '#444', fontStyle: 'italic' }}>{f.flag_notes}</div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
              {f.slug && (
                <a
                  href={`/browse/${f.slug}?admin=1&token=${encodeURIComponent(token)}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 11, color: '#2E6FB8' }}
                >
                  Open in editor →
                </a>
              )}
              <button
                onClick={() => toggleResolved(f)}
                disabled={busy.has(f.id)}
                style={{
                  padding: '4px 10px',
                  fontFamily: 'monospace',
                  fontSize: 11,
                  border: '1px solid #ccc',
                  background: '#fff',
                  cursor: busy.has(f.id) ? 'not-allowed' : 'pointer',
                }}
              >
                {status === 'unresolved' ? 'Mark resolved' : 'Re-open'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
