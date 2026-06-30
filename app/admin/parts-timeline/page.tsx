'use client';

import { useEffect, useState, useMemo, Fragment } from 'react';
import { useSearchParams } from 'next/navigation';

// ── Colour palette for OEM number spans ───────────────────────────────────────
const SPAN_COLORS = [
  '#C9A84C', '#4C7FC9', '#4CC97F', '#C94C4C', '#9B4CC9',
  '#C9804C', '#4CC9C9', '#C94C9B', '#6BC94C', '#4C4CC9',
];
function colorForOem(oem: string, palette: string[]): string {
  let h = 0;
  for (let i = 0; i < oem.length; i++) h = (h * 31 + oem.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface ModelRow { family: string; model_code: string; }
interface Span {
  oem_part_no: string; year_start: number; year_end: number;
  product_id: number | null; sku: string | null;
  computed_price: string | null; source_vendor: string | null;
}
type Tree = Record<string, Record<string, Record<string, Span[]>>>;

interface TimelineData {
  model: string; min_year: number; max_year: number;
  categories: { display_category: string; display_subcategory: string }[];
  tree: Tree;
}

interface Tooltip {
  span: Span; x: number; y: number;
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function PartsTimelinePage() {
  const params  = useSearchParams();
  const token   = params.get('token') ?? '';

  const [models,      setModels]      = useState<ModelRow[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [catFilter,   setCatFilter]   = useState('');
  const [subcatFilter,setSubcatFilter]= useState('');
  const [data,        setData]        = useState<TimelineData | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [tooltip,     setTooltip]     = useState<Tooltip | null>(null);

  // Load model list
  useEffect(() => {
    fetch(`/api/admin/parts-timeline?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => setModels(d.models ?? []));
  }, [token]);

  // Group models by family for the selector
  const families = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const m of models) {
      if (!map[m.family]) map[m.family] = [];
      map[m.family].push(m.model_code);
    }
    return map;
  }, [models]);

  // Subcategory options filtered to selected category
  const subcatOptions = useMemo(() => {
    if (!data) return [];
    return data.categories
      .filter(c => !catFilter || c.display_category === catFilter)
      .map(c => c.display_subcategory)
      .filter(Boolean);
  }, [data, catFilter]);

  // Load timeline data when model/filters change
  useEffect(() => {
    if (!selectedModel) return;
    setLoading(true);
    const q = new URLSearchParams({ token, model: selectedModel });
    if (catFilter)    q.set('category', catFilter);
    if (subcatFilter) q.set('subcat',   subcatFilter);
    fetch(`/api/admin/parts-timeline?${q}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [selectedModel, catFilter, subcatFilter, token]);

  // Reset subcat when category changes
  useEffect(() => { setSubcatFilter(''); }, [catFilter]);

  const minYear = data?.min_year ?? 1954;
  const maxYear = data?.max_year ?? 2026;
  const totalYears = maxYear - minYear + 1;
  const YEAR_W = 28; // px per year column
  const LABEL_W = 260; // px for part name column

  // Count total rows for display
  const totalParts = useMemo(() => {
    if (!data) return 0;
    return Object.values(data.tree).flatMap(s =>
      Object.values(s).flatMap(p => Object.keys(p))
    ).length;
  }, [data]);

  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      background: '#f5f0e8', minHeight: '100vh', color: '#1a1a1a',
    }}
      onClick={() => setTooltip(null)}
    >
      {/* ── Header ── */}
      <div style={{ background: '#1a1208', padding: '18px 28px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#C9A84C', fontFamily: 'monospace' }}>
          Parts Timeline
        </h1>

        {/* Model selector */}
        <select
          value={selectedModel}
          onChange={e => { setSelectedModel(e.target.value); setCatFilter(''); setSubcatFilter(''); setData(null); }}
          style={{ fontSize: 13, padding: '6px 10px', borderRadius: 6, border: '1px solid #C9A84C', background: '#2a1f0a', color: '#f5f0e8', minWidth: 160 }}
        >
          <option value="">— select model —</option>
          {Object.entries(families).map(([family, codes]) => (
            <optgroup key={family} label={family}>
              {codes.map(c => <option key={c} value={c}>{c}</option>)}
            </optgroup>
          ))}
        </select>

        {/* Category filter */}
        {data && (
          <select
            value={catFilter}
            onChange={e => setCatFilter(e.target.value)}
            style={{ fontSize: 13, padding: '6px 10px', borderRadius: 6, border: '1px solid #555', background: '#2a1f0a', color: '#f5f0e8', minWidth: 160 }}
          >
            <option value="">All categories</option>
            {[...new Set(data.categories.map(c => c.display_category))].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}

        {/* Subcategory filter */}
        {data && catFilter && (
          <select
            value={subcatFilter}
            onChange={e => setSubcatFilter(e.target.value)}
            style={{ fontSize: 13, padding: '6px 10px', borderRadius: 6, border: '1px solid #555', background: '#2a1f0a', color: '#f5f0e8', minWidth: 160 }}
          >
            <option value="">All subcategories</option>
            {subcatOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}

        {data && (
          <span style={{ fontSize: 12, color: '#999', marginLeft: 'auto' }}>
            {totalParts.toLocaleString()} parts · {minYear}–{maxYear}
          </span>
        )}
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>Loading timeline…</div>
      )}

      {!selectedModel && !loading && (
        <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>
          Select a model code above to view its parts timeline.
        </div>
      )}

      {/* ── Timeline ── */}
      {data && !loading && (
        <div style={{ overflowX: 'auto', paddingBottom: 40 }}>
          <table style={{ borderCollapse: 'collapse', minWidth: LABEL_W + totalYears * YEAR_W }}>
            {/* Sticky year header */}
            <thead>
              <tr>
                <th style={{
                  position: 'sticky', left: 0, zIndex: 3,
                  width: LABEL_W, minWidth: LABEL_W,
                  background: '#1a1208', padding: '8px 12px',
                  textAlign: 'left', fontSize: 11, color: '#C9A84C',
                  fontWeight: 700, borderBottom: '2px solid #C9A84C',
                }}>
                  Part
                </th>
                {Array.from({ length: totalYears }, (_, i) => minYear + i).map(yr => (
                  <th key={yr} style={{
                    width: YEAR_W, minWidth: YEAR_W, maxWidth: YEAR_W,
                    background: '#1a1208', padding: '4px 0',
                    textAlign: 'center', fontSize: 10, color: yr % 5 === 0 ? '#C9A84C' : '#666',
                    fontWeight: yr % 5 === 0 ? 700 : 400,
                    borderBottom: '2px solid #C9A84C', borderLeft: '1px solid #2a2a2a',
                    writingMode: 'vertical-rl', transform: 'rotate(180deg)',
                    height: 52,
                  }}>
                    {yr}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {Object.entries(data.tree).map(([cat, subcats]) => (
                <Fragment key={`cat-${cat}`}>
                  {/* Category header row */}
                  <tr>
                    <td colSpan={totalYears + 1} style={{
                      background: '#2a1f0a', color: '#C9A84C',
                      fontSize: 12, fontWeight: 700, padding: '8px 12px',
                      position: 'sticky', left: 0,
                      borderTop: '2px solid #C9A84C', letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                    }}>
                      {cat}
                    </td>
                  </tr>

                  {Object.entries(subcats).map(([subcat, parts]) => (
                    <Fragment key={`sub-${cat}-${subcat}`}>
                      {/* Subcategory header */}
                      <tr>
                        <td colSpan={totalYears + 1} style={{
                          background: '#f0ead8', color: '#6b5a3a',
                          fontSize: 11, fontWeight: 600, padding: '5px 12px 5px 20px',
                          position: 'sticky', left: 0,
                          borderTop: '1px solid #ddd8cc',
                          textTransform: 'uppercase', letterSpacing: '0.04em',
                        }}>
                          {subcat}
                        </td>
                      </tr>

                      {/* Part rows */}
                      {Object.entries(parts).map(([partName, spans], rowIdx) => (
                        <tr key={`part-${cat}-${subcat}-${partName}`}
                          style={{ background: rowIdx % 2 === 0 ? '#fffdf8' : '#f9f5ed' }}
                        >
                          {/* Sticky label */}
                          <td style={{
                            position: 'sticky', left: 0, zIndex: 1,
                            background: rowIdx % 2 === 0 ? '#fffdf8' : '#f9f5ed',
                            width: LABEL_W, minWidth: LABEL_W, maxWidth: LABEL_W,
                            padding: '4px 10px',
                            fontSize: 12, color: '#1a1a1a',
                            borderRight: '2px solid #ddd8cc',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}
                            title={partName}
                          >
                            {partName}
                          </td>

                          {/* Year cells with spans */}
                          {Array.from({ length: totalYears }, (_, i) => {
                            const yr = minYear + i;
                            const span = spans.find(s => yr >= s.year_start && yr <= s.year_end);
                            const isStart = span && yr === span.year_start;
                            const isEnd   = span && yr === span.year_end;

                            if (!span) return (
                              <td key={yr} style={{
                                borderLeft: '1px solid #eee8d8',
                                background: 'transparent', height: 26,
                              }} />
                            );

                            const color = colorForOem(span.oem_part_no, SPAN_COLORS);
                            return (
                              <td key={yr} style={{
                                borderLeft: isStart ? `2px solid ${color}` : '1px solid #eee8d8',
                                borderRight: isEnd ? `2px solid ${color}` : undefined,
                                background: color + '33',
                                height: 26, padding: 0, position: 'relative', cursor: 'pointer',
                              }}
                                onClick={e => {
                                  e.stopPropagation();
                                  if (isStart) setTooltip({ span, x: e.clientX, y: e.clientY });
                                }}
                              >
                                {isStart && (
                                  <div style={{
                                    position: 'absolute', left: 3, top: '50%', transform: 'translateY(-50%)',
                                    fontSize: 9, fontFamily: 'monospace', fontWeight: 700,
                                    color: color, whiteSpace: 'nowrap', overflow: 'hidden',
                                    maxWidth: (span.year_end - span.year_start + 1) * YEAR_W - 6,
                                    pointerEvents: 'none',
                                  }}>
                                    {span.oem_part_no}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tooltip ── */}
      {tooltip && (
        <div style={{
          position: 'fixed', left: Math.min(tooltip.x + 12, window.innerWidth - 280),
          top: Math.min(tooltip.y + 8, window.innerHeight - 160),
          background: '#1a1208', border: '1px solid #C9A84C',
          borderRadius: 8, padding: '12px 16px', zIndex: 100,
          fontSize: 12, color: '#f5f0e8', minWidth: 240, pointerEvents: 'none',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}>
          <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#C9A84C', fontSize: 14, marginBottom: 8 }}>
            {tooltip.span.oem_part_no}
          </div>
          <div style={{ color: '#aaa', marginBottom: 4 }}>
            {tooltip.span.year_start}–{tooltip.span.year_end}
          </div>
          {tooltip.span.sku ? (
            <>
              <div style={{ marginBottom: 2 }}>
                <span style={{ color: '#888' }}>SKU: </span>
                <span style={{ fontFamily: 'monospace' }}>{tooltip.span.sku}</span>
              </div>
              {tooltip.span.computed_price && (
                <div style={{ marginBottom: 2 }}>
                  <span style={{ color: '#888' }}>Price: </span>
                  <span style={{ color: '#C9A84C', fontWeight: 700 }}>${Number(tooltip.span.computed_price).toFixed(2)}</span>
                </div>
              )}
              {tooltip.span.source_vendor && (
                <div>
                  <span style={{ color: '#888' }}>Vendor: </span>{tooltip.span.source_vendor}
                </div>
              )}
            </>
          ) : (
            <div style={{ color: '#666', fontStyle: 'italic' }}>No product match in catalog</div>
          )}
        </div>
      )}
    </div>
  );
}
