'use client';
import { useState } from 'react';

const TABS = ['DETAILS', 'OEM', 'FITMENT'];

// ── Colour tokens (dark coal theme) ──────────────────────────────────────────
const C = {
  surface:    '#0c0a06',
  iron:       '#161209',
  border:     'rgba(197,167,34,0.14)',
  borderGold: 'rgba(197,167,34,0.45)',
  textPrime:  '#f0e8d8',
  textDim:    '#a09890',
  textMuted:  '#706860',
  gold:       '#c9a84c',
  goldDim:    '#8a7040',
};

export default function PDPTabs({ fitment, oemRows, details }) {
  const defaultTab = details ? 'DETAILS' : fitment?.length ? 'FITMENT' : 'OEM';
  const [active, setActive] = useState(defaultTab);

  return (
    <div style={{ padding: '0', borderTop: `1px solid ${C.border}` }}>

      {/* ── Tab bar ── */}
      <div style={{
        display: 'flex',
        borderBottom: `1px solid ${C.border}`,
        background: C.surface,
        padding: '0 28px',
      }}>
        {TABS.map(tab => {
          const isActive = active === tab;
          return (
            <button
              key={tab}
              onClick={() => setActive(tab)}
              style={{
                padding: '12px 20px',
                fontFamily: 'var(--font-stencil)',
                fontSize: 10,
                letterSpacing: '0.14em',
                color: isActive ? C.gold : C.textMuted,
                background: 'transparent',
                border: 'none',
                borderBottom: isActive ? `2px solid ${C.gold}` : '2px solid transparent',
                marginBottom: -1,
                cursor: 'pointer',
                borderRadius: 0,
                textTransform: 'uppercase',
                transition: 'color 0.15s',
              }}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ── */}
      <div style={{
        background: C.iron,
        borderBottom: `1px solid ${C.border}`,
        padding: '24px 28px',
        minHeight: 180,
      }}>
        {active === 'DETAILS'  && <DetailsContent details={details} />}
        {active === 'OEM'      && <OemContent oemRows={oemRows} />}
        {active === 'FITMENT'  && <FitmentContent fitment={fitment} />}
      </div>
    </div>
  );
}

// ── Details ───────────────────────────────────────────────────────────────────

function DetailsContent({ details }) {
  if (!details) return <Empty>No product details on file.</Empty>;

  const { description, features, tech_note, attributes } = details;
  const hasAttrs = attributes && typeof attributes === 'object' && Object.keys(attributes).length > 0;
  const hasContent = description || features?.length || hasAttrs || tech_note;
  if (!hasContent) return <Empty>No product details on file.</Empty>;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: hasAttrs ? '1fr auto' : '1fr',
      gap: 28,
      alignItems: 'start',
    }}>

      {/* Left: description + features + tech note */}
      <div>
        {description && (
          <p style={{
            fontFamily: 'var(--font-bespoke)',
            fontSize: 14,
            color: C.textPrime,
            lineHeight: 1.65,
            margin: '0 0 18px',
          }}>
            {description}
          </p>
        )}

        {features?.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {features.map((f, i) => (
              <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ color: C.gold, fontSize: 12, lineHeight: '1.6', flexShrink: 0 }}>›</span>
                <span style={{ fontFamily: 'var(--font-bespoke)', fontSize: 13, color: C.textPrime, lineHeight: 1.55 }}>
                  {f}
                </span>
              </li>
            ))}
          </ul>
        )}

        {tech_note && (
          <div style={{
            marginTop: (description || features?.length) ? 18 : 0,
            padding: '10px 14px',
            background: 'rgba(197,167,34,0.05)',
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
            <div style={{ fontFamily: 'var(--font-bespoke)', fontSize: 13, color: C.textPrime, lineHeight: 1.55 }}>
              {tech_note}
            </div>
          </div>
        )}
      </div>

      {/* Right: specifications */}
      {hasAttrs && (
        <div style={{ minWidth: 200, borderLeft: `1px solid ${C.border}`, paddingLeft: 28 }}>
          <div style={{
            fontFamily: 'var(--font-stencil)',
            fontSize: 8,
            color: C.goldDim,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginBottom: 12,
          }}>
            Specifications
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Object.entries(attributes).map(([key, val]) => (
              <div key={key}>
                <div style={{
                  fontFamily: 'var(--font-stencil)',
                  fontSize: 8,
                  color: C.textMuted,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginBottom: 3,
                }}>
                  {key}
                </div>
                <div style={{
                  fontFamily: 'var(--font-bespoke)',
                  fontSize: 13,
                  color: C.textPrime,
                  fontWeight: 600,
                }}>
                  {String(val)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── OEM numbers ───────────────────────────────────────────────────────────────

function OemContent({ oemRows }) {
  if (!oemRows?.length) return <Empty>No OEM cross-reference data on file.</Empty>;

  const primary   = oemRows.filter(r => r.oem_format?.startsWith('hd_oem') && !r.expanded_from);
  const secondary = oemRows.filter(r => !r.oem_format?.startsWith('hd_oem') || r.expanded_from);

  return (
    <div>
      {primary.length > 0 && (
        <div style={{ marginBottom: secondary.length ? 20 : 0 }}>
          <div style={{
            fontFamily: 'var(--font-stencil)',
            fontSize: 8,
            color: C.goldDim,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginBottom: 10,
          }}>
            HD OEM Numbers
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {primary.map((r, i) => (
              <span key={i} style={{
                fontFamily: 'var(--font-stencil)',
                fontSize: 12,
                color: C.gold,
                background: 'rgba(201,168,76,0.08)',
                border: `1px solid rgba(201,168,76,0.40)`,
                borderRadius: 0,
                padding: '5px 12px',
                letterSpacing: '0.06em',
              }}>
                {r.oem_number}
              </span>
            ))}
          </div>
        </div>
      )}

      {secondary.length > 0 && (
        <div>
          <div style={{
            fontFamily: 'var(--font-stencil)',
            fontSize: 8,
            color: C.goldDim,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginBottom: 10,
          }}>
            Cross Reference
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {secondary.map((r, i) => (
              <span key={i} style={{
                fontFamily: 'var(--font-stencil)',
                fontSize: 11,
                color: C.textDim,
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${C.border}`,
                borderRadius: 0,
                padding: '4px 10px',
                letterSpacing: '0.04em',
              }}>
                {r.oem_number}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Fitment ───────────────────────────────────────────────────────────────────

function FitmentContent({ fitment }) {
  if (!fitment?.length) return <Empty>No fitment data on file.</Empty>;

  const groups = [];
  const indexByFamily = new Map();
  for (const row of fitment) {
    const key = row.family_name || 'Other';
    if (!indexByFamily.has(key)) {
      indexByFamily.set(key, groups.length);
      groups.push({ family: key, rows: [] });
    }
    groups[indexByFamily.get(key)].rows.push(row);
  }

  const [query, setQuery] = useState('');
  const [openFamily, setOpenFamily] = useState(groups[0]?.family ?? null);

  const q = query.trim().toLowerCase();
  const visibleGroups = q
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

  const showSearch = fitment.length > 8 || groups.length > 1;

  return (
    <div>
      {showSearch && (
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Filter by model, family, or year…"
          style={{
            width: '100%', boxSizing: 'border-box', marginBottom: 12,
            padding: '8px 12px',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            color: C.textPrime,
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 0,
            outline: 'none',
          }}
        />
      )}

      <div style={{ maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {visibleGroups.length === 0 && <Empty>No matching fitment.</Empty>}
        {visibleGroups.map(group => {
          const isOpen = q ? true : openFamily === group.family;
          return (
            <div key={group.family} style={{ border: `1px solid ${C.border}`, overflow: 'hidden' }}>
              <button
                onClick={() => !q && setOpenFamily(isOpen ? null : group.family)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '9px 12px',
                  cursor: q ? 'default' : 'pointer',
                  background: isOpen ? 'rgba(197,167,34,0.06)' : 'rgba(255,255,255,0.02)',
                  border: 'none',
                  borderBottom: isOpen ? `1px solid ${C.border}` : 'none',
                  textAlign: 'left',
                }}
              >
                <span style={{
                  fontFamily: 'var(--font-stencil)',
                  fontSize: 10,
                  color: isOpen ? C.gold : C.textDim,
                  letterSpacing: '0.10em',
                  textTransform: 'uppercase',
                }}>
                  {group.family}{' '}
                  <span style={{ color: C.textMuted }}>({group.rows.length})</span>
                </span>
                {!q && (
                  <span style={{
                    color: C.textMuted,
                    fontSize: 10,
                    transition: 'transform 0.15s',
                    transform: isOpen ? 'rotate(180deg)' : 'none',
                    display: 'inline-block',
                  }}>▾</span>
                )}
              </button>

              {isOpen && (
                <div style={{ padding: '4px 12px 8px' }}>
                  {group.rows.map((row, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '5px 0',
                      borderBottom: i < group.rows.length - 1
                        ? `1px solid rgba(197,167,34,0.07)`
                        : 'none',
                    }}>
                      <span style={{
                        fontFamily: 'var(--font-stencil)',
                        fontSize: 11,
                        color: C.textPrime,
                        letterSpacing: '0.04em',
                        flex: '0 0 auto',
                      }}>
                        {row.model_name ? `${row.model_name} (${row.model_code})` : row.model_code}
                      </span>
                      <span style={{
                        fontFamily: 'var(--font-stencil)',
                        fontSize: 11,
                        color: C.textDim,
                      }}>
                        {row.year_from === row.year_to
                          ? row.year_from
                          : `${row.year_from}–${row.year_to}`}
                      </span>
                      <span style={{
                        fontFamily: 'var(--font-stencil)',
                        fontSize: 10,
                        color: '#5a9a5a',
                        marginLeft: 'auto',
                      }}>
                        ✓
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Helper ────────────────────────────────────────────────────────────────────

function Empty({ children }) {
  return (
    <div style={{
      fontFamily: 'var(--font-stencil)',
      fontSize: 10,
      color: C.textMuted,
      letterSpacing: '0.08em',
    }}>
      {children}
    </div>
  );
}
