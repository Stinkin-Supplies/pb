'use client';
import { useState } from 'react';
import { Tabs } from '@/components/ui/tabs';

// ── Colour tokens (dark coal theme) ──────────────────────────────────────────
const C = {
  surface:    '#0c0a06',
  iron:       '#161209',
  panel:      '#111009',
  border:     'rgba(197,167,34,0.14)',
  borderGold: 'rgba(197,167,34,0.45)',
  textPrime:  '#f0e8d8',
  textDim:    '#a09890',
  textMuted:  '#706860',
  gold:       '#c9a84c',
  goldDim:    '#8a7040',
};

export default function PDPTabs({ fitment, oemRows, details }) {
  const fitmentCount = fitment?.length ?? 0;
  const oemCount     = oemRows?.length ?? 0;

  const tabs = [
    {
      title:   'Details',
      value:   'details',
      content: <DetailsContent details={details} />,
    },
    {
      title:   'OEM',
      value:   'oem',
      badge:   oemCount || null,
      content: <OemContent oemRows={oemRows} />,
    },
    {
      title:   'Fitment',
      value:   'fitment',
      badge:   fitmentCount || null,
      content: <FitmentContent fitment={fitment} />,
    },
  ];

  const defaultValue = details
    ? 'details'
    : fitmentCount ? 'fitment' : 'oem';

  return (
    <div style={{
      borderTop: `1px solid ${C.border}`,
      paddingTop: 24,
    }}>
      <div style={{ padding: '0 28px 28px' }}>
        <Tabs tabs={tabs} defaultValue={defaultValue} />
      </div>
    </div>
  );
}

// ── Panel wrapper ─────────────────────────────────────────────────────────────
function Panel({ children }) {
  return (
    <div style={{
      background: C.panel,
      border: `1px solid ${C.border}`,
      borderTop: 'none',
      padding: '24px 24px',
      minHeight: 180,
    }}>
      {children}
    </div>
  );
}

// ── Details ───────────────────────────────────────────────────────────────────

function DetailsContent({ details }) {
  if (!details) return <Panel><Empty>No product details on file.</Empty></Panel>;

  const { description, features, tech_note, attributes } = details;
  const attrs = attributes && typeof attributes === 'object' ? Object.entries(attributes) : [];
  const hasContent = description || features?.length || attrs.length || tech_note;
  if (!hasContent) return <Panel><Empty>No product details on file.</Empty></Panel>;

  return (
    <Panel>
      <div style={{
        display: 'grid',
        gridTemplateColumns: attrs.length ? '1fr 220px' : '1fr',
        gap: 32,
        alignItems: 'start',
      }}>

        {/* Left: description + bullets + tech note */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {description && (
            <p style={{
              fontFamily: 'var(--font-bespoke)',
              fontSize: 14,
              color: C.textPrime,
              lineHeight: 1.7,
              margin: 0,
            }}>
              {description}
            </p>
          )}

          {features?.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
              {features.map((f, i) => (
                <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ color: C.gold, fontSize: 13, lineHeight: '1.55', flexShrink: 0, marginTop: 1 }}>›</span>
                  <span style={{ fontFamily: 'var(--font-bespoke)', fontSize: 13, color: C.textPrime, lineHeight: 1.6 }}>
                    {f}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {tech_note && (
            <div style={{
              padding: '12px 16px',
              background: 'rgba(197,167,34,0.04)',
              border: `1px solid ${C.border}`,
              borderLeft: `3px solid ${C.gold}`,
            }}>
              <div style={{
                fontFamily: 'var(--font-stencil)',
                fontSize: 8,
                color: C.goldDim,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}>
                Tech Note
              </div>
              <div style={{ fontFamily: 'var(--font-bespoke)', fontSize: 13, color: C.textPrime, lineHeight: 1.6 }}>
                {tech_note}
              </div>
            </div>
          )}
        </div>

        {/* Right: specification table */}
        {attrs.length > 0 && (
          <div style={{
            borderLeft: `1px solid ${C.border}`,
            paddingLeft: 24,
          }}>
            <SectionLabel>Specifications</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {attrs.map(([key, val], i) => (
                <div key={key} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 12,
                  padding: '8px 0',
                  borderBottom: i < attrs.length - 1 ? `1px solid ${C.border}` : 'none',
                }}>
                  <span style={{
                    fontFamily: 'var(--font-stencil)',
                    fontSize: 9,
                    color: C.textMuted,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    flexShrink: 0,
                  }}>
                    {key}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-bespoke)',
                    fontSize: 13,
                    color: C.textPrime,
                    fontWeight: 600,
                    textAlign: 'right',
                  }}>
                    {String(val)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

// ── OEM numbers ───────────────────────────────────────────────────────────────

function OemContent({ oemRows }) {
  const [copied, setCopied] = useState(null);

  if (!oemRows?.length) return <Panel><Empty>No OEM cross-reference data on file.</Empty></Panel>;

  const primary   = oemRows.filter(r => r.oem_format?.startsWith('hd_oem') && !r.expanded_from);
  const secondary = oemRows.filter(r => !r.oem_format?.startsWith('hd_oem') || r.expanded_from);

  function copy(num) {
    navigator.clipboard?.writeText(num).then(() => {
      setCopied(num);
      setTimeout(() => setCopied(null), 1800);
    });
  }

  const OemBadge = ({ num, prominent }) => (
    <button
      title="Click to copy"
      onClick={() => copy(num)}
      style={{
        fontFamily: 'var(--font-stencil)',
        fontSize: prominent ? 12 : 11,
        color: copied === num ? '#5cb85c' : (prominent ? C.gold : C.textDim),
        background: copied === num
          ? 'rgba(92,184,92,0.08)'
          : prominent ? 'rgba(201,168,76,0.08)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${copied === num ? 'rgba(92,184,92,0.35)' : prominent ? 'rgba(201,168,76,0.40)' : C.border}`,
        borderRadius: 0,
        padding: prominent ? '6px 14px' : '4px 10px',
        letterSpacing: '0.06em',
        cursor: 'pointer',
        transition: 'all 0.15s',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {copied === num ? '✓ Copied' : num}
    </button>
  );

  return (
    <Panel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {primary.length > 0 && (
          <div>
            <SectionLabel>HD OEM Numbers</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {primary.map((r, i) => <OemBadge key={i} num={r.oem_number} prominent />)}
            </div>
          </div>
        )}

        {secondary.length > 0 && (
          <div>
            <SectionLabel>Cross Reference</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {secondary.map((r, i) => <OemBadge key={i} num={r.oem_number} prominent={false} />)}
            </div>
          </div>
        )}

        {primary.length === 0 && secondary.length === 0 && (
          <Empty>No OEM cross-reference data on file.</Empty>
        )}
      </div>
    </Panel>
  );
}

// ── Fitment ───────────────────────────────────────────────────────────────────

function FitmentContent({ fitment }) {
  const [query, setQuery] = useState('');
  const [openFamilies, setOpenFamilies] = useState(new Set());

  if (!fitment?.length) return <Panel><Empty>No fitment data on file.</Empty></Panel>;

  // Group by family
  const groupMap = new Map();
  for (const row of fitment) {
    const key = row.family_name || 'Other';
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key).push(row);
  }
  const groups = [...groupMap.entries()].map(([family, rows]) => ({ family, rows }));

  // Default first family open
  const firstFamily = groups[0]?.family;
  if (firstFamily && openFamilies.size === 0) {
    // Use a ref-less trick: add to set inline (safe because this is deterministic)
    openFamilies.add(firstFamily);
  }

  function toggleFamily(name) {
    setOpenFamilies(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  const q = query.trim().toLowerCase();
  const filteredGroups = q
    ? groups
        .map(g => ({
          ...g,
          rows: g.rows.filter(r =>
            g.family.toLowerCase().includes(q) ||
            r.model_code?.toLowerCase().includes(q) ||
            r.model_name?.toLowerCase().includes(q) ||
            String(r.year_from).includes(q) ||
            String(r.year_to).includes(q)
          ),
        }))
        .filter(g => g.rows.length > 0)
    : groups;

  const totalModels = filteredGroups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <Panel>

      {/* Search + summary row */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Filter by model, code, or year…"
          style={{
            flex: 1,
            padding: '9px 14px',
            fontFamily: 'var(--font-bespoke)',
            fontSize: 13,
            color: C.textPrime,
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 0,
            outline: 'none',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => e.target.style.borderColor = C.borderGold}
          onBlur={e => e.target.style.borderColor = C.border}
        />
        <div style={{
          fontFamily: 'var(--font-stencil)',
          fontSize: 9,
          color: C.textMuted,
          letterSpacing: '0.08em',
          whiteSpace: 'nowrap',
        }}>
          {totalModels} {totalModels === 1 ? 'MODEL' : 'MODELS'}
        </div>
      </div>

      {/* Family accordion list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 460, overflowY: 'auto' }}>
        {filteredGroups.length === 0 && <Empty>No matching fitment.</Empty>}

        {filteredGroups.map(group => {
          const isOpen = q ? true : openFamilies.has(group.family);
          return (
            <div key={group.family} style={{
              border: `1px solid ${isOpen ? C.borderGold : C.border}`,
              transition: 'border-color 0.15s',
              overflow: 'hidden',
            }}>

              {/* Family header row */}
              <button
                onClick={() => !q && toggleFamily(group.family)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '11px 16px',
                  cursor: q ? 'default' : 'pointer',
                  background: isOpen ? 'rgba(197,167,34,0.07)' : 'transparent',
                  border: 'none',
                  borderBottom: isOpen ? `1px solid ${C.border}` : 'none',
                  textAlign: 'left',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    width: 3,
                    height: 14,
                    flexShrink: 0,
                    background: isOpen ? C.gold : C.textMuted,
                    display: 'inline-block',
                    transition: 'background 0.15s',
                  }} />
                  <span style={{
                    fontFamily: 'var(--font-stencil)',
                    fontSize: 11,
                    color: isOpen ? C.gold : C.textDim,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                  }}>
                    {group.family}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-stencil)',
                    fontSize: 8,
                    color: C.textMuted,
                    letterSpacing: '0.06em',
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${C.border}`,
                    padding: '2px 7px',
                  }}>
                    {group.rows.length}
                  </span>
                </div>

                {/* Year range summary for family */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    fontFamily: 'var(--font-stencil)',
                    fontSize: 9,
                    color: C.textMuted,
                    letterSpacing: '0.06em',
                  }}>
                    {Math.min(...group.rows.map(r => r.year_from))}
                    {' – '}
                    {Math.max(...group.rows.map(r => r.year_to))}
                  </span>
                  {!q && (
                    <span style={{
                      color: isOpen ? C.gold : C.textMuted,
                      fontSize: 11,
                      lineHeight: 1,
                      transition: 'transform 0.2s',
                      display: 'inline-block',
                      transform: isOpen ? 'rotate(180deg)' : 'none',
                    }}>▾</span>
                  )}
                </div>
              </button>

              {/* Model rows */}
              {isOpen && (
                <div>
                  {group.rows.map((row, i) => (
                    <div key={i} style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      alignItems: 'center',
                      gap: 16,
                      padding: '10px 16px 10px 25px',
                      background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                      borderTop: i > 0 ? `1px solid rgba(197,167,34,0.06)` : 'none',
                    }}>

                      {/* Model name + code */}
                      <div>
                        <div style={{
                          fontFamily: 'var(--font-stencil)',
                          fontSize: 11,
                          color: C.textPrime,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                        }}>
                          {row.model_name || row.model_code}
                        </div>
                        {row.model_name && row.model_code && (
                          <div style={{
                            fontFamily: 'var(--font-stencil)',
                            fontSize: 9,
                            color: C.goldDim,
                            letterSpacing: '0.08em',
                            marginTop: 2,
                          }}>
                            {row.model_code}
                          </div>
                        )}
                      </div>

                      {/* Year badge */}
                      <div style={{
                        fontFamily: 'var(--font-stencil)',
                        fontSize: 11,
                        color: C.textDim,
                        letterSpacing: '0.06em',
                        background: 'rgba(197,167,34,0.06)',
                        border: `1px solid rgba(197,167,34,0.18)`,
                        padding: '5px 12px',
                        whiteSpace: 'nowrap',
                      }}>
                        {row.year_from === row.year_to
                          ? row.year_from
                          : `${row.year_from} – ${row.year_to}`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div style={{
      fontFamily: 'var(--font-stencil)',
      fontSize: 8,
      color: C.goldDim,
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
    }}>
      {children}
    </div>
  );
}

function Empty({ children }) {
  return (
    <div style={{
      fontFamily: 'var(--font-stencil)',
      fontSize: 10,
      color: C.textMuted,
      letterSpacing: '0.08em',
      padding: '16px 0',
    }}>
      {children}
    </div>
  );
}
