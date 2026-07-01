'use client';

// app/admin/variant-candidates/page.tsx
//
// Lists groups flagged from the canonical match review tool as "these are
// finish/size/color variants of the same part, not duplicates". Includes
// an inline "Build group" form that creates catalog_variant_groups +
// catalog_variant_members + backfills variant_group_id in one click.

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const VENDOR_COLORS: Record<string, string> = {
  PU: '#7c5fd6', WPS: '#2E6FB8', VTWIN: '#c9a84c', VTwin: '#c9a84c',
};

// ── Same attribute-detection logic as build_variant_groups.cjs ────────────────

function toTitleCase(s: string) {
  return s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

const ATTRIBUTE_RULES: Array<{
  name: string;
  pattern: RegExp;
  extract: (m: RegExpMatchArray) => string;
}> = [
  { name: 'Size',
    pattern: /([+-]0\.0\d{2,3}|\bSTD\b|\bO\.?S\.?\b|\bU\.?S\.?\b|\boversize\b|\bundersize\b)/i,
    extract: m => m[1].toUpperCase() },
  { name: 'Compound',
    pattern: /\b(organic|sintered|semi.?metallic|ceramic)\b/i,
    extract: m => toTitleCase(m[1]) },
  { name: 'Apparel Size',
    pattern: /\b(4XL|3XL|2XL|XXL|XXXL|XL|LGE?|LRG|MED|SM|XS|\dX(?:-?L)?)\b/i,
    extract: m => m[1].toUpperCase()
      .replace('LGE','LG').replace('LRG','LG').replace('MED','M').replace('SM','S') },
  { name: 'Gauge',
    pattern: /\b(\d{1,2})\s*-?\s*(?:gauge\b|ga\b)/i,
    extract: m => m[1] + ' Gauge' },
  { name: 'Rise',
    pattern: /\b(\d{1,2}(?:\.\d+)?)[""]\s*(?:ape|rise|tall)/i,
    extract: m => m[1] + '" Rise' },
  { name: 'Finish',
    pattern: /\b(brushed ss|brushed stainless|brushed|raw ss|raw stainless|matte black|gloss black|satin black|flat black|polished chrome|show chrome|powder coat(?:ed)?|zinc(?: plated)?|cadmium(?: plated)?|nickel(?: plated)?|hard chrome|chrome plated)\b/i,
    extract: m => {
      const v = m[1].toLowerCase();
      if (v === 'brushed ss') return 'Brushed SS';
      if (v === 'raw ss') return 'Raw SS';
      if (v === 'brushed stainless') return 'Brushed Stainless';
      if (v === 'raw stainless') return 'Raw Stainless';
      if (v === 'brushed') return 'Brushed';
      return toTitleCase(m[1]);
    } },
  { name: 'Throttle',
    pattern: /\b(push-?pull|pull-?only|single cable|dual cable|single throttle|dual throttle)\b/i,
    extract: m => toTitleCase(m[1]) },
  { name: 'Color',
    pattern: /\b(black|chrome|red|blue|brown|silver|gold|white|yellow|green|orange|purple|gr[ae]y|clear|natural|stainless|\bSS\b)\b/i,
    extract: m => m[1].toUpperCase() === 'SS' ? 'Stainless' : toTitleCase(m[1]) },
];

function extractAttribute(name: string): { name: string; value: string } | null {
  for (const rule of ATTRIBUTE_RULES) {
    const m = name.match(rule.pattern);
    if (m) return { name: rule.name === 'Finish' ? 'Color' : rule.name, value: rule.extract(m) };
  }
  return null;
}

// Find a second, distinct attribute type in the same name (e.g. a rotor named
// "10 Inch Drilled Stainless" has both a Style-ish word and a Finish word).
// Skips whichever rule matched as the primary axis so the two never collide.
function extractSecondAttribute(name: string, primaryAxisName: string | null): { name: string; value: string } | null {
  for (const rule of ATTRIBUTE_RULES) {
    const normalized = rule.name === 'Finish' ? 'Color' : rule.name;
    if (normalized === primaryAxisName) continue;
    const m = name.match(rule.pattern);
    if (m) return { name: normalized, value: rule.extract(m) };
  }
  return null;
}

// Guess a clean group display name: strip the detected attribute value from
// the shortest product name, then trim punctuation/dashes from the edges.
function guessGroupName(products: CandidateProduct[]): string {
  if (!products.length) return '';
  const sorted = [...products].sort((a, b) => a.name.length - b.name.length);
  let base = sorted[0].name;
  const attr = extractAttribute(base);
  if (attr) {
    base = base.replace(new RegExp(`\\b${attr.value}\\b`, 'i'), '').trim();
  }
  return base.replace(/[\s\-–—,]+$/, '').replace(/^[\s\-–—,]+/, '').trim();
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface CandidateProduct {
  id: number;
  name: string;
  source_vendor: string;
  vendor_sku: string | null;
  brand: string | null;
  computed_price: number;
  image_url: string | null;
  display_category: string;
  display_subcategory: string | null;
}

// Shape returned by /api/admin/canonical-matches/search-products — used for
// the "attach product" tool. Mapped down to CandidateProduct for display.
interface SearchResultProduct {
  id: number;
  name: string;
  source_vendor: string;
  vendor_sku: string | null;
  brand: string | null;
  brand_part_number: string | null;
  computed_price: number;
  image_url: string | null;
  display_category: string;
  display_subcategory: string | null;
  is_kit: boolean;
}

function toCandidateProduct(p: SearchResultProduct): CandidateProduct {
  return {
    id: p.id,
    name: p.name,
    source_vendor: p.source_vendor,
    vendor_sku: p.vendor_sku,
    brand: p.brand,
    computed_price: p.computed_price,
    image_url: p.image_url,
    display_category: p.display_category,
    display_subcategory: p.display_subcategory,
  };
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

interface MemberDraft {
  product_id: number;
  option_1_name: string;
  option_1_value: string;
  option_2_name: string;
  option_2_value: string;
  sort_order: number;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VariantCandidatesPage() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());

  // Per-candidate build-form state
  const [buildOpen, setBuildOpen] = useState<Set<number>>(new Set());
  const [displayNames, setDisplayNames] = useState<Record<number, string>>({});
  const [familyKeys, setFamilyKeys] = useState<Record<number, string>>({});
  const [memberDrafts, setMemberDrafts] = useState<Record<number, MemberDraft[]>>({});
  const [buildMsgs, setBuildMsgs] = useState<Record<number, { text: string; ok: boolean }>>({});

  // Freeform editing: products added beyond the auto-flagged candidate, and
  // originally-flagged products the person chose to drop from the group.
  const [extraProducts, setExtraProducts] = useState<Record<number, CandidateProduct[]>>({});
  const [removedProductIds, setRemovedProductIds] = useState<Record<number, Set<number>>>({});

  // "Attach product" search tool (per candidate)
  const [attachQuery, setAttachQuery] = useState<Record<number, string>>({});
  const [attachResults, setAttachResults] = useState<Record<number, CandidateProduct[]>>({});
  const [attachLoading, setAttachLoading] = useState<Record<number, boolean>>({});

  // Custom (freeform) axis name, used when the preset AXIS_OPTIONS don't fit
  const [customAxisInput, setCustomAxisInput] = useState<Record<number, string>>({});
  const [customAxis2Input, setCustomAxis2Input] = useState<Record<number, string>>({});

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/canonical-matches/variant-candidates?token=${encodeURIComponent(token)}&resolved=${showResolved}`,
        { cache: 'no-store' }
      );
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

  // Merge the originally-flagged candidate products with anything manually
  // attached, minus anything manually removed. This is the single source of
  // truth for "what's in this group" everywhere in the UI.
  function getGroupProducts(c: Candidate): CandidateProduct[] {
    const removed = removedProductIds[c.id];
    const original = (c.products ?? []).filter(p => !removed?.has(p.id));
    const extra = extraProducts[c.id] ?? [];
    return [...original, ...extra];
  }

  // Open the build form for a candidate, seeding labels from auto-detection
  function openBuild(c: Candidate) {
    const products = getGroupProducts(c);
    setBuildOpen(prev => new Set(prev).add(c.id));

    if (!displayNames[c.id]) {
      setDisplayNames(prev => ({ ...prev, [c.id]: guessGroupName(products) }));
    }

    if (!memberDrafts[c.id]) {
      const drafts: MemberDraft[] = products.map((p, i) => {
        const attr = extractAttribute(p.name);
        const axis1 = attr?.name ?? 'Color';
        const attr2 = extractSecondAttribute(p.name, axis1);
        return {
          product_id: p.id,
          option_1_name: axis1,
          option_1_value: attr?.value ?? '',
          option_2_name: attr2?.name ?? '',
          option_2_value: attr2?.value ?? '',
          sort_order: i,
        };
      });
      setMemberDrafts(prev => ({ ...prev, [c.id]: drafts }));
    }
  }

  function closeBuild(id: number) {
    setBuildOpen(prev => { const n = new Set(prev); n.delete(id); return n; });
  }

  function updateMember(candidateId: number, productId: number, field: keyof MemberDraft, value: string | number) {
    setMemberDrafts(prev => ({
      ...prev,
      [candidateId]: (prev[candidateId] ?? []).map(m =>
        m.product_id === productId ? { ...m, [field]: value } : m
      ),
    }));
  }

  // Sync the option_1_name across all members when one changes (they share an axis)
  function syncAxisName(candidateId: number, axisName: string) {
    setMemberDrafts(prev => ({
      ...prev,
      [candidateId]: (prev[candidateId] ?? []).map(m => ({ ...m, option_1_name: axisName })),
    }));
  }

  // Sync the option_2_name across all members. Passing '' clears the second
  // axis entirely (also blanks every option_2_value so a stale label can't
  // linger after the axis is removed).
  function syncAxis2Name(candidateId: number, axisName: string) {
    setMemberDrafts(prev => ({
      ...prev,
      [candidateId]: (prev[candidateId] ?? []).map(m => ({
        ...m,
        option_2_name: axisName,
        option_2_value: axisName ? m.option_2_value : '',
      })),
    }));
  }

  // ── Attach product search ──────────────────────────────────────────────
  async function searchAttach(candidateId: number) {
    const q = (attachQuery[candidateId] ?? '').trim();
    if (q.length < 2) return;
    setAttachLoading(prev => ({ ...prev, [candidateId]: true }));
    try {
      const res = await fetch(
        `/api/admin/canonical-matches/search-products?token=${encodeURIComponent(token)}&q=${encodeURIComponent(q)}&limit=15`,
        { cache: 'no-store' }
      );
      const data = await res.json();
      const results: SearchResultProduct[] = data.results ?? [];
      setAttachResults(prev => ({ ...prev, [candidateId]: results.map(toCandidateProduct) }));
    } finally {
      setAttachLoading(prev => ({ ...prev, [candidateId]: false }));
    }
  }

  // Add a product (from search) into the group — updates the product list,
  // seeds a member draft for it if the build form is open, and un-marks it
  // as removed if it was previously dropped from this same candidate.
  function addProduct(c: Candidate, product: CandidateProduct) {
    const alreadyIn = getGroupProducts(c).some(p => p.id === product.id);
    if (alreadyIn) return;

    setRemovedProductIds(prev => {
      const n = new Set(prev[c.id] ?? []);
      n.delete(product.id);
      return { ...prev, [c.id]: n };
    });
    setExtraProducts(prev => ({
      ...prev,
      [c.id]: [...(prev[c.id] ?? []), product],
    }));

    if (memberDrafts[c.id]) {
      const currentAxis = memberDrafts[c.id][0]?.option_1_name ?? 'Color';
      const currentAxis2 = memberDrafts[c.id][0]?.option_2_name ?? '';
      const attr = extractAttribute(product.name);
      const attr2 = currentAxis2 ? extractSecondAttribute(product.name, currentAxis) : null;
      setMemberDrafts(prev => ({
        ...prev,
        [c.id]: [...(prev[c.id] ?? []), {
          product_id: product.id,
          option_1_name: currentAxis,
          option_1_value: attr?.value ?? '',
          option_2_name: currentAxis2,
          option_2_value: attr2?.value ?? '',
          sort_order: (prev[c.id] ?? []).length,
        }],
      }));
    }

    // clear the search UI for this candidate
    setAttachQuery(prev => ({ ...prev, [c.id]: '' }));
    setAttachResults(prev => ({ ...prev, [c.id]: [] }));
  }

  // Drop a product from the group — works whether it came from the original
  // flag or was manually attached.
  function removeProduct(candidateId: number, productId: number) {
    setExtraProducts(prev => ({
      ...prev,
      [candidateId]: (prev[candidateId] ?? []).filter(p => p.id !== productId),
    }));
    setRemovedProductIds(prev => {
      const n = new Set(prev[candidateId] ?? []);
      n.add(productId);
      return { ...prev, [candidateId]: n };
    });
    setMemberDrafts(prev => ({
      ...prev,
      [candidateId]: (prev[candidateId] ?? []).filter(m => m.product_id !== productId),
    }));
  }

  // Apply a freeform axis name (typed, not from the AXIS_OPTIONS presets)
  function applyCustomAxis(candidateId: number) {
    const name = (customAxisInput[candidateId] ?? '').trim();
    if (!name) return;
    syncAxisName(candidateId, name);
  }

  function applyCustomAxis2(candidateId: number) {
    const name = (customAxis2Input[candidateId] ?? '').trim();
    if (!name) return;
    syncAxis2Name(candidateId, name);
  }

  async function buildGroup(c: Candidate) {
    const drafts = memberDrafts[c.id] ?? [];
    const name = displayNames[c.id]?.trim();
    if (!name) {
      setBuildMsgs(prev => ({ ...prev, [c.id]: { text: 'Group name is required', ok: false } }));
      return;
    }
    for (const d of drafts) {
      if (!d.option_1_value.trim()) {
        setBuildMsgs(prev => ({ ...prev, [c.id]: { text: `Label value missing for product ${d.product_id}`, ok: false } }));
        return;
      }
    }

    setBusyIds(prev => new Set(prev).add(c.id));
    setBuildMsgs(prev => ({ ...prev, [c.id]: { text: 'Creating...', ok: true } }));

    try {
      const res = await fetch('/api/admin/variant-groups/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          display_name: name,
          family_key: familyKeys[c.id]?.trim() || null,
          candidate_id: c.id,
          members: drafts,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setBuildMsgs(prev => ({ ...prev, [c.id]: { text: `Error: ${data.error}`, ok: false } }));
        return;
      }
      setBuildMsgs(prev => ({
        ...prev,
        [c.id]: { text: `Group #${data.group_id} created — ${data.members_created} members linked`, ok: true },
      }));
      // Remove from list (it's now resolved)
      setTimeout(() => setCandidates(prev => prev.filter(x => x.id !== c.id)), 1200);
      setExtraProducts(prev => { const n = { ...prev }; delete n[c.id]; return n; });
      setRemovedProductIds(prev => { const n = { ...prev }; delete n[c.id]; return n; });
      setAttachQuery(prev => { const n = { ...prev }; delete n[c.id]; return n; });
      setAttachResults(prev => { const n = { ...prev }; delete n[c.id]; return n; });
    } finally {
      setBusyIds(prev => { const n = new Set(prev); n.delete(c.id); return n; });
    }
  }

  const AXIS_OPTIONS = ['Color', 'Size', 'Apparel Size', 'Finish', 'Compound', 'Gauge', 'Rise', 'Throttle', 'Pack Size'];

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
          Groups flagged from{' '}
          <a href={`/admin/canonical-matches?token=${encodeURIComponent(token)}`} style={{ color: '#1d4f87' }}>
            Canonical Match Review
          </a>{' '}
          as finish/size/color variants of the same part. Click <strong>Build group</strong> to assign labels,
          attach or remove products, set a custom axis if none of the presets fit, and create the variant group
          directly in the database.
        </p>

        {loading && <div style={{ color: '#666' }}>Loading...</div>}
        {!loading && candidates.length === 0 && (
          <div style={{ padding: 48, textAlign: 'center', color: '#999', border: '1px dashed #ccc', borderRadius: 10 }}>
            {showResolved ? 'No resolved candidates.' : 'No pending variant candidates — nice.'}
          </div>
        )}

        {candidates.map(c => {
          const isBusy = busyIds.has(c.id);
          const isOpen = buildOpen.has(c.id);
          const drafts = memberDrafts[c.id] ?? [];
          const buildMsg = buildMsgs[c.id];
          const products = getGroupProducts(c);

          return (
            <div key={c.id} style={{
              border: '1px solid #ddd8cc', borderRadius: 10, marginBottom: 16,
              overflow: 'hidden', background: '#fff',
            }}>
              {/* ── Header ── */}
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
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {buildMsg && (
                    <span style={{ fontSize: 12, fontWeight: 600, color: buildMsg.ok ? '#1E8A6B' : '#c0392b' }}>
                      {buildMsg.text}
                    </span>
                  )}
                  <button
                    disabled={isBusy}
                    onClick={() => isOpen ? closeBuild(c.id) : openBuild(c)}
                    style={{
                      fontSize: 12, padding: '6px 12px', borderRadius: 5,
                      border: `1px solid ${isOpen ? '#aaa' : '#534AB7'}`,
                      background: isOpen ? '#f0f0f0' : '#eeedfe',
                      color: isOpen ? '#666' : '#534AB7',
                      fontWeight: 700, cursor: isBusy ? 'default' : 'pointer',
                      opacity: isBusy ? 0.5 : 1, textTransform: 'none',
                    }}
                  >
                    {isOpen ? 'Cancel' : 'Build group'}
                  </button>
                  <button
                    disabled={isBusy}
                    onClick={() => markResolved(c.id, true)}
                    style={{
                      fontSize: 12, padding: '6px 12px', borderRadius: 5,
                      border: '1px solid #3B6D11', background: '#e6f4d9', color: '#3B6D11',
                      fontWeight: 700, cursor: isBusy ? 'default' : 'pointer',
                      opacity: isBusy ? 0.5 : 1, textTransform: 'none',
                    }}
                  >
                    {showResolved ? 'Mark unresolved' : 'Mark resolved'}
                  </button>
                </div>
              </div>

              {/* ── Product cards ── */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: 14 }}>
                {products.map(p => (
                  <div key={p.id} style={{
                    display: 'flex', gap: 12, alignItems: 'flex-start',
                    border: '1px solid #eee', borderRadius: 8, padding: 12,
                    flex: '1 1 280px', minWidth: 260, background: '#fcfbf8',
                  }}>
                    {p.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/image-proxy?url=${encodeURIComponent(p.image_url)}`} alt="" style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 4, background: '#fff', border: '1px solid #eee', flexShrink: 0 }} />
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
                      {p.brand && (
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#7c5fd6', textTransform: 'none' }}>{p.brand}</div>
                      )}
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

              {/* ── Build group form (inline, opens below cards) ── */}
              {isOpen && (
                <div style={{
                  margin: '0 14px 14px', padding: 16,
                  border: '1px solid #d4c9f5', borderRadius: 8,
                  background: '#f8f7fe',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#534AB7', marginBottom: 12 }}>
                    Build variant group
                  </div>

                  {/* Group name + family key */}
                  <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                    <label style={{ flex: '1 1 260px', fontSize: 11, color: '#666' }}>
                      Group display name <span style={{ color: '#c0392b' }}>*</span>
                      <input
                        value={displayNames[c.id] ?? ''}
                        onChange={e => setDisplayNames(prev => ({ ...prev, [c.id]: e.target.value }))}
                        placeholder="e.g. Cam Cover Gasket — Twin Cam"
                        style={{
                          display: 'block', width: '100%', marginTop: 4,
                          fontSize: 13, padding: '7px 10px',
                          border: '1px solid #c8bff5', borderRadius: 6, background: '#fff',
                        }}
                      />
                    </label>
                    <label style={{ flex: '0 0 200px', fontSize: 11, color: '#666' }}>
                      Family key <span style={{ color: '#aaa' }}>(optional — links sibling groups)</span>
                      <input
                        value={familyKeys[c.id] ?? ''}
                        onChange={e => setFamilyKeys(prev => ({ ...prev, [c.id]: e.target.value }))}
                        placeholder="e.g. cam-cover-tc"
                        style={{
                          display: 'block', width: '100%', marginTop: 4,
                          fontSize: 12, padding: '7px 10px', fontFamily: 'monospace',
                          border: '1px solid #c8bff5', borderRadius: 6, background: '#fff',
                        }}
                      />
                    </label>
                  </div>

                  {/* Axis name selector (shared across all members) */}
                  <div style={{ marginBottom: 12 }}>
                    <span style={{ fontSize: 11, color: '#666' }}>Variant axis (applies to all):</span>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
                      {AXIS_OPTIONS.map(axis => {
                        const currentAxis = drafts[0]?.option_1_name ?? 'Color';
                        return (
                          <button
                            key={axis}
                            onClick={() => syncAxisName(c.id, axis)}
                            style={{
                              fontSize: 11, padding: '4px 10px', borderRadius: 12,
                              border: `1px solid ${currentAxis === axis ? '#534AB7' : '#ccc'}`,
                              background: currentAxis === axis ? '#534AB7' : '#fff',
                              color: currentAxis === axis ? '#fff' : '#555',
                              cursor: 'pointer', fontWeight: currentAxis === axis ? 700 : 400,
                            }}
                          >
                            {axis}
                          </button>
                        );
                      })}
                      <span style={{ fontSize: 11, color: '#ccc', margin: '0 2px' }}>|</span>
                      <input
                        value={customAxisInput[c.id] ?? ''}
                        onChange={e => setCustomAxisInput(prev => ({ ...prev, [c.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') applyCustomAxis(c.id); }}
                        placeholder="Custom axis..."
                        style={{
                          fontSize: 11, padding: '4px 10px', borderRadius: 12, width: 120,
                          border: `1px solid ${!AXIS_OPTIONS.includes(drafts[0]?.option_1_name ?? 'Color') && drafts.length ? '#534AB7' : '#ccc'}`,
                          background: '#fff', color: '#555',
                        }}
                      />
                      <button
                        onClick={() => applyCustomAxis(c.id)}
                        style={{
                          fontSize: 11, padding: '4px 10px', borderRadius: 12,
                          border: '1px solid #ccc', background: '#fff', color: '#555', cursor: 'pointer',
                        }}
                      >
                        Apply
                      </button>
                    </div>
                  </div>

                  {/* Secondary axis selector (optional) — for products that vary along
                      two independent dimensions at once, e.g. Style groups where members
                      also differ by Size (10" vs 11.5" rotor within the same Drilled style). */}
                  <div style={{ marginBottom: 16 }}>
                    <span style={{ fontSize: 11, color: '#666' }}>
                      Secondary axis <span style={{ color: '#aaa' }}>(optional — e.g. Size within a Style group)</span>:
                    </span>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
                      {(() => {
                        const currentAxis2 = drafts[0]?.option_2_name ?? '';
                        return (
                          <button
                            onClick={() => syncAxis2Name(c.id, '')}
                            style={{
                              fontSize: 11, padding: '4px 10px', borderRadius: 12,
                              border: `1px solid ${!currentAxis2 ? '#534AB7' : '#ccc'}`,
                              background: !currentAxis2 ? '#534AB7' : '#fff',
                              color: !currentAxis2 ? '#fff' : '#555',
                              cursor: 'pointer', fontWeight: !currentAxis2 ? 700 : 400,
                            }}
                          >
                            None
                          </button>
                        );
                      })()}
                      {AXIS_OPTIONS.filter(a => a !== (drafts[0]?.option_1_name ?? 'Color')).map(axis => {
                        const currentAxis2 = drafts[0]?.option_2_name ?? '';
                        return (
                          <button
                            key={axis}
                            onClick={() => syncAxis2Name(c.id, axis)}
                            style={{
                              fontSize: 11, padding: '4px 10px', borderRadius: 12,
                              border: `1px solid ${currentAxis2 === axis ? '#534AB7' : '#ccc'}`,
                              background: currentAxis2 === axis ? '#534AB7' : '#fff',
                              color: currentAxis2 === axis ? '#fff' : '#555',
                              cursor: 'pointer', fontWeight: currentAxis2 === axis ? 700 : 400,
                            }}
                          >
                            {axis}
                          </button>
                        );
                      })}
                      <span style={{ fontSize: 11, color: '#ccc', margin: '0 2px' }}>|</span>
                      <input
                        value={customAxis2Input[c.id] ?? ''}
                        onChange={e => setCustomAxis2Input(prev => ({ ...prev, [c.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') applyCustomAxis2(c.id); }}
                        placeholder="Custom axis..."
                        style={{
                          fontSize: 11, padding: '4px 10px', borderRadius: 12, width: 120,
                          border: '1px solid #ccc', background: '#fff', color: '#555',
                        }}
                      />
                      <button
                        onClick={() => applyCustomAxis2(c.id)}
                        style={{
                          fontSize: 11, padding: '4px 10px', borderRadius: 12,
                          border: '1px solid #ccc', background: '#fff', color: '#555', cursor: 'pointer',
                        }}
                      >
                        Apply
                      </button>
                    </div>
                  </div>

                  {/* Attach product — search and add anything into this group */}
                  <div style={{ marginBottom: 16, padding: 10, border: '1px dashed #c8bff5', borderRadius: 8, background: '#fff' }}>
                    <span style={{ fontSize: 11, color: '#666' }}>Attach product to this group:</span>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <input
                        value={attachQuery[c.id] ?? ''}
                        onChange={e => setAttachQuery(prev => ({ ...prev, [c.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') searchAttach(c.id); }}
                        placeholder="Search name, SKU, brand part #..."
                        style={{
                          flex: 1, fontSize: 13, padding: '6px 10px',
                          border: '1px solid #c8bff5', borderRadius: 6, background: '#fff',
                        }}
                      />
                      <button
                        onClick={() => searchAttach(c.id)}
                        disabled={attachLoading[c.id]}
                        style={{
                          fontSize: 12, padding: '6px 14px', borderRadius: 6,
                          border: '1px solid #534AB7', background: '#eeedfe', color: '#534AB7',
                          fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        {attachLoading[c.id] ? 'Searching...' : 'Search'}
                      </button>
                    </div>
                    {(attachResults[c.id] ?? []).length > 0 && (
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
                        {(attachResults[c.id] ?? []).map(r => {
                          const alreadyIn = products.some(p => p.id === r.id);
                          return (
                            <div key={r.id} style={{
                              display: 'flex', gap: 8, alignItems: 'center', padding: '6px 8px',
                              border: '1px solid #eee', borderRadius: 6, background: alreadyIn ? '#f5f5f5' : '#fcfbf8',
                            }}>
                              <span style={{
                                fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 8,
                                color: '#fff', background: VENDOR_COLORS[r.source_vendor] ?? '#888',
                                textTransform: 'uppercase', flexShrink: 0,
                              }}>
                                {r.source_vendor}
                              </span>
                              <span style={{ flex: 1, fontSize: 12, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {r.name}{r.brand ? ` — ${r.brand}` : ''}
                              </span>
                              <span style={{ fontSize: 11, color: '#999', flexShrink: 0 }}>${Number(r.computed_price).toFixed(2)}</span>
                              <button
                                onClick={() => addProduct(c, r)}
                                disabled={alreadyIn}
                                style={{
                                  fontSize: 11, padding: '3px 10px', borderRadius: 5, flexShrink: 0,
                                  border: '1px solid #3B6D11', background: alreadyIn ? '#eee' : '#e6f4d9',
                                  color: alreadyIn ? '#999' : '#3B6D11', fontWeight: 700,
                                  cursor: alreadyIn ? 'default' : 'pointer',
                                }}
                              >
                                {alreadyIn ? 'Added' : '+ Add'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Per-product label rows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: drafts[0]?.option_2_name ? '1fr 140px 140px 56px 26px' : '1fr 140px 56px 26px',
                      gap: 8, fontSize: 10, color: '#aaa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', paddingLeft: 60,
                    }}>
                      <span>Product</span>
                      <span>{drafts[0]?.option_1_name || 'Label value'}</span>
                      {drafts[0]?.option_2_name && <span>{drafts[0].option_2_name}</span>}
                      <span>Order</span>
                      <span></span>
                    </div>
                    {drafts.map(d => {
                      const p = products.find(x => x.id === d.product_id);
                      if (!p) return null;
                      return (
                        <div key={d.product_id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          {/* Thumbnail */}
                          {p.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={`/api/image-proxy?url=${encodeURIComponent(p.image_url)}`} alt="" style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 4, border: '1px solid #eee', background: '#fff', flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: 40, height: 40, background: '#ede9f8', borderRadius: 4, flexShrink: 0 }} />
                          )}
                          {/* Product name + vendor */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <span style={{
                                fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 8,
                                color: '#fff', background: VENDOR_COLORS[p.source_vendor] ?? '#888',
                                textTransform: 'uppercase', flexShrink: 0,
                              }}>
                                {p.source_vendor}
                              </span>
                              <span style={{ fontSize: 12, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {p.name}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 1 }}>
                              {p.brand && (
                                <span style={{ fontSize: 10, fontWeight: 600, color: '#7c5fd6' }}>{p.brand}</span>
                              )}
                              {p.vendor_sku && (
                                <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#bbb' }}>{p.vendor_sku}</span>
                              )}
                            </div>
                          </div>
                          {/* Label value input */}
                          <input
                            value={d.option_1_value}
                            onChange={e => updateMember(c.id, d.product_id, 'option_1_value', e.target.value)}
                            placeholder="e.g. Chrome"
                            style={{
                              width: 140, flexShrink: 0,
                              fontSize: 13, padding: '6px 8px',
                              border: `1px solid ${d.option_1_value.trim() ? '#c8bff5' : '#f5a623'}`,
                              borderRadius: 6, background: '#fff', fontWeight: 600,
                            }}
                          />
                          {/* Secondary label value input — only rendered when a second axis is set */}
                          {drafts[0]?.option_2_name && (
                            <input
                              value={d.option_2_value}
                              onChange={e => updateMember(c.id, d.product_id, 'option_2_value', e.target.value)}
                              placeholder={`e.g. ${drafts[0].option_2_name}`}
                              style={{
                                width: 140, flexShrink: 0,
                                fontSize: 13, padding: '6px 8px',
                                border: '1px solid #c8bff5',
                                borderRadius: 6, background: '#fff', fontWeight: 600,
                              }}
                            />
                          )}
                          <input
                            type="number"
                            value={d.sort_order}
                            min={0}
                            onChange={e => updateMember(c.id, d.product_id, 'sort_order', parseInt(e.target.value) || 0)}
                            style={{
                              width: 56, flexShrink: 0,
                              fontSize: 12, padding: '6px 8px', textAlign: 'center',
                              border: '1px solid #ddd', borderRadius: 6, background: '#fff',
                            }}
                          />
                          {/* Remove from group */}
                          <button
                            onClick={() => removeProduct(c.id, d.product_id)}
                            title="Remove from group"
                            style={{
                              width: 26, height: 26, flexShrink: 0, borderRadius: 6,
                              border: '1px solid #e0b0b0', background: '#fdf2f2', color: '#c0392b',
                              fontWeight: 700, cursor: 'pointer', fontSize: 13, lineHeight: 1,
                            }}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                    {drafts.length < 2 && (
                      <div style={{ fontSize: 11, color: '#c0392b', fontWeight: 600 }}>
                        Need at least 2 products in the group — attach one above before creating.
                      </div>
                    )}
                  </div>

                  {/* Submit */}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <button
                      disabled={isBusy || drafts.length < 2}
                      onClick={() => buildGroup(c)}
                      style={{
                        fontSize: 13, padding: '8px 20px', borderRadius: 6,
                        border: '1px solid #3B6D11', background: '#e6f4d9', color: '#3B6D11',
                        fontWeight: 700, cursor: (isBusy || drafts.length < 2) ? 'default' : 'pointer',
                        opacity: (isBusy || drafts.length < 2) ? 0.5 : 1, textTransform: 'none',
                      }}
                    >
                      {isBusy ? 'Creating...' : `Create group (${drafts.length} members)`}
                    </button>
                    <span style={{ fontSize: 11, color: '#999' }}>
                      Creates the group, links all members, backfills variant_group_id, marks this candidate resolved.
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
