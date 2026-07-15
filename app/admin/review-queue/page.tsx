'use client';

/**
 * app/admin/review-queue/page.tsx
 *
 * The "manual review bucket" — every product Claude or the AdminEditPanel's
 * "Flag Issue" mode has flagged as needing a human call (ambiguous
 * category/subcategory, no clean system to route it to, etc), instead of
 * being silently left in a probably-wrong bucket or force-classified.
 * Access via /admin/review-queue?token=YOUR_ADMIN_SECRET
 */

import { useEffect, useState, useCallback } from 'react';
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

const FLAG_LABELS: Record<string, string> = {
  wrong_category: 'Wrong category',
  wrong_subcategory: 'Wrong subcategory',
  missing_fitment: 'Missing fitment',
  wrong_fitment: 'Incorrect fitment',
  bad_image: 'Bad / missing image',
  duplicate: 'Possible duplicate',
  other: 'Other issue',
};

export default function ReviewQueuePage() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [status, setStatus] = useState<'unresolved' | 'resolved'>('unresolved');
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<number>>(new Set());

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
    }
  }, [token, status]);

  useEffect(() => { load(); }, [load]);

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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {flags.map(f => (
          <div
            key={f.id}
            style={{
              border: '1px solid #ddd',
              padding: '12px 14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 16,
            }}
          >
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
