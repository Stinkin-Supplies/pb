'use client';

// app/admin/variant-candidates/page.tsx
//
// Lists groups flagged from the canonical match review tool as "these are
// finish/size/color variants of the same part, not duplicates — revisit to
// build a proper variant group (variant_group_id)".

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const VENDOR_COLORS: Record<string, string> = {
  PU: '#7c5fd6', WPS: '#2E6FB8', VTWIN: '#c9a84c', VTwin: '#c9a84c',
};

interface CandidateProduct {
  id: number;
  name: string;
  source_vendor: string;
  vendor_sku: string | null;
  computed_price: number;
  image_url: string | null;
  display_category: string;
  display_subcategory: string | null;
}

interface Candidate {
  id: number;
  group_key: string;
  product_ids: number[];
  reason: string | null;
  notes: string | null;
  resolved: boolean;
  created_at: string;
  products: CandidateProduct[] | null;
}

export default function VariantCandidatesPage() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/canonical-matches/variant-candidates?token=${encodeURIComponent(token)}&resolved=${showResolved}`, { cache: 'no-store' });
      const data = await res.json();
      setCandidates(data.candidates ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [showResolved]); // eslint-disable-line react-hooks/exhaustive-deps

  async function markResolved(id: number, resolved: boolean) {
    setBusyIds(prev => new Set(prev).add(id));
    try {
      await fetch('/api/admin/canonical-matches/variant-candidates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, id, resolved }),
      });
      setCandidates(prev => prev.filter(c => c.id !== id));
    } finally {
      setBusyIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  }

  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      background: '#ffffff', color: '#1a1a1a', textTransform: 'none',
      letterSpacing: 'normal', minHeight: '100vh', WebkitFontSmoothing: 'antialiased',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px 80px' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, flexWrap: 'wrap', gap: 10 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#1a1a1a', textTransform: 'none' }}>
            Variant Candidates
          </h1>
          <label style={{ fontSize: 13, color: '#555', display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} />
            Show resolved
          </label>
        </div>

        <p style={{ fontSize: 13, color: '#666', marginTop: 0, marginBottom: 24, textTransform: 'none' }}>
          Groups flagged from <a href={`/admin/canonical-matches?token=${encodeURIComponent(token)}`} style={{ color: '#1d4f87' }}>Canonical Match Review</a> as
          finish/size/color variants of the same part rather than duplicates. The underlying proposals were rejected automatically when flagged.
          Use these as a checklist for building proper <code>variant_group_id</code> groupings — click &quot;Mark resolved&quot; once a variant group exists for that part.
        </p>

        {loading && <div style={{ color: '#666' }}>Loading...</div>}
        {!loading && candidates.length === 0 && (
          <div style={{ padding: 48, textAlign: 'center', color: '#999', border: '1px dashed #ccc', borderRadius: 10 }}>
            {showResolved ? 'No resolved candidates.' : 'No pending variant candidates — nice.'}
          </div>
        )}

        {candidates.map(c => {
          const isBusy = busyIds.has(c.id);
          return (
            <div key={c.id} style={{
              border: '1px solid #ddd8cc', borderRadius: 10, marginBottom: 16, overflow: 'hidden', background: '#fff',
            }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 16px', background: '#faf8f3', borderBottom: '1px solid #ddd8cc',
                flexWrap: 'wrap', gap: 8,
              }}>
                <div style={{ fontSize: 13, color: '#555', textTransform: 'none' }}>
                  {c.group_key.startsWith('MANUAL-') ? (
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#534AB7', fontSize: 14 }}>Manual match</span>
                  ) : (
                    <>OEM <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1a1a1a', fontSize: 14 }}>{c.group_key}</span></>
                  )}
                  {c.reason && (
                    <span style={{
                      marginLeft: 10, fontSize: 11, fontWeight: 700, color: '#534AB7',
                      background: '#eeedfe', padding: '2px 8px', borderRadius: 10,
                    }}>
                      {c.reason}
                    </span>
                  )}
                  <span style={{ marginLeft: 10, color: '#999' }}>
                    flagged {new Date(c.created_at).toLocaleDateString()}
                  </span>
                </div>
                <button
                  disabled={isBusy}
                  onClick={() => markResolved(c.id, true)}
                  style={{
                    fontSize: 12, padding: '6px 12px', borderRadius: 5,
                    border: '1px solid #3B6D11', background: '#e6f4d9', color: '#3B6D11',
                    fontWeight: 700, cursor: isBusy ? 'default' : 'pointer', opacity: isBusy ? 0.5 : 1, textTransform: 'none',
                  }}
                >
                  {showResolved ? 'Mark unresolved' : 'Mark resolved'}
                </button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: 14 }}>
                {(c.products ?? []).map(p => (
                  <div key={p.id} style={{
                    display: 'flex', gap: 12, alignItems: 'flex-start',
                    border: '1px solid #eee', borderRadius: 8, padding: 12,
                    flex: '1 1 280px', minWidth: 260, background: '#fcfbf8',
                  }}>
                    {p.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image_url} alt="" style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 4, background: '#fff', border: '1px solid #eee', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 48, height: 48, background: '#f0eee8', borderRadius: 4, flexShrink: 0 }} />
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
                          color: '#fff', background: VENDOR_COLORS[p.source_vendor] ?? '#888',
                          textTransform: 'uppercase', letterSpacing: '0.04em',
                        }}>
                          {p.source_vendor}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>${Number(p.computed_price).toFixed(2)}</span>
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.35, color: '#1a1a1a', marginBottom: 4, textTransform: 'none' }}>
                        {p.name}
                      </div>
                      {p.vendor_sku && (
                        <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#aaa' }}>{p.vendor_sku}</div>
                      )}
                      <div style={{ fontSize: 11, color: '#999', textTransform: 'none' }}>
                        {p.display_category}{p.display_subcategory ? ` / ${p.display_subcategory}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
