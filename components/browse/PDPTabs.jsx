'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Colour tokens — light "paper" surface, matches ProductImageGallery,
// VariantSelector, and OemPartTimeline (already built against this palette). ──
const P = {
  bg:       '#f5f0e8',
  bgAlt:    '#ede4cc',
  card:     '#fdfbf4',
  header:   '#ddd3b2',
  headerOn: '#cfc09a',
  ink:      '#1a1208',
  inkDim:   '#5a4828',
  inkMuted: '#8a7040',
  gold:     '#7a5e14',
  goldDim:  '#a07c30',
  border:   'rgba(100,78,20,0.20)',
  borderOn: 'rgba(100,78,20,0.45)',
  pillOn:   '#7a5e14',
};

export default function PDPTabs({ fitment, oemRows, details }) {
  const fitmentCount = fitment?.length ?? 0;
  const oemCount     = oemRows?.length ?? 0;
  const fitOemBadge  = fitmentCount + oemCount || null;

  const tabs = [
    {
      title:   'Details',
      value:   'details',
      content: <DetailsContent details={details} />,
    },
    {
      title:   'Fitment & OEM',
      value:   'fitment-oem',
      badge:   fitOemBadge,
      content: (
        <>
          <OemContent oemRows={oemRows} />
          <FitmentContent fitment={fitment} />
        </>
      ),
    },
  ];

  const defaultValue = details ? 'details' : 'fitment-oem';
  const [active, setActive] = useState(defaultValue);
  const activeTab = tabs.find(t => t.value === active) ?? tabs[0];

  return (
    <div style={{
      borderTop: `1px solid rgba(197,167,34,0.14)`,
      padding: '24px 28px 28px',
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '190px 1fr',
        gap: 16,
        alignItems: 'start',
      }}>
        {/* Vertical pill rail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tabs.map(tab => {
            const isActive = tab.value === active;
            return (
              <button
                key={tab.value}
                onClick={() => setActive(tab.value)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '11px 14px',
                  border: `1px solid ${isActive ? P.pillOn : 'rgba(197,167,34,0.30)'}`,
                  borderRadius: 999,
                  background: isActive ? P.pillOn : 'transparent',
                  color: isActive ? '#f0e8d8' : '#a09080',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-stencil)',
                  fontSize: 10.5,
                  letterSpacing: '0.10em',
                  textTransform: 'uppercase',
                  transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                  textAlign: 'left',
                  whiteSpace: 'nowrap',
                }}
              >
                {tab.title}
                {tab.badge != null && (
                  <span style={{
                    fontSize: 9,
                    color: isActive ? 'rgba(240,232,216,0.75)' : 'rgba(197,167,34,0.6)',
                    background: isActive ? 'rgba(0,0,0,0.16)' : 'rgba(197,167,34,0.10)',
                    padding: '2px 7px',
                    borderRadius: 999,
                    lineHeight: 1.5,
                    flexShrink: 0,
                  }}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Content panel */}
        <div style={{ position: 'relative', minWidth: 0 }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab.value}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              {activeTab.content}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ── Panel wrapper ─────────────────────────────────────────────────────────────
function Panel({ children }) {
  return (
    <div style={{
      background: P.bg,
      border: `1px solid ${P.border}`,
      padding: '20px 20px',
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
              color: P.ink,
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
                  <span style={{ color: P.gold, fontSize: 13, lineHeight: '1.55', flexShrink: 0, marginTop: 1 }}>›</span>
                  <span style={{ fontFamily: 'var(--font-bespoke)', fontSize: 13, color: P.ink, lineHeight: 1.6 }}>
                    {f}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {tech_note && (
            <div style={{
              padding: '12px 16px',
              background: 'rgba(122,94,20,0.05)',
              border: `1px solid ${P.border}`,
              borderLeft: `3px solid ${P.gold}`,
            }}>
              <div style={{
                fontFamily: 'var(--font-stencil)',
                fontSize: 8,
                color: P.goldDim,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}>
                Tech Note
              </div>
              <div style={{ fontFamily: 'var(--font-bespoke)', fontSize: 13, color: P.ink, lineHeight: 1.6 }}>
                {tech_note}
              </div>
            </div>
          )}
        </div>

        {/* Right: specification table */}
        {attrs.length > 0 && (
          <div style={{
            borderLeft: `1px solid ${P.border}`,
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
                  borderBottom: i < attrs.length - 1 ? `1px solid ${P.border}` : 'none',
                }}>
                  <span style={{
                    fontFamily: 'var(--font-stencil)',
                    fontSize: 9,
                    color: P.inkMuted,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    flexShrink: 0,
                  }}>
                    {key}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-bespoke)',
                    fontSize: 13,
                    color: P.ink,
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

  if (!oemRows?.length) return null;

  const primary   = oemRows.filter(r => r.oem_format?.startsWith('hd_oem') && !r.expanded_from);
  const secondary = oemRows.filter(r => !r.oem_format?.startsWith('hd_oem') || r.expanded_from);
  if (primary.length === 0 && secondary.length === 0) return null;

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
        color: copied === num ? '#3f7a3f' : (prominent ? P.gold : P.inkDim),
        background: copied === num
          ? 'rgba(63,122,63,0.08)'
          : prominent ? 'rgba(122,94,20,0.08)' : 'rgba(0,0,0,0.03)',
        border: `1px solid ${copied === num ? 'rgba(63,122,63,0.35)' : prominent ? 'rgba(122,94,20,0.35)' : P.border}`,
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
    <div style={{
      background: P.bg,
      border: `1px solid ${P.border}`,
      borderBottom: 'none',
      padding: '18px 20px',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
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
      </div>
    </div>
  );
}

// ── Fitment ───────────────────────────────────────────────────────────────────

function FitmentContent({ fitment }) {
  const [query, setQuery] = useState('');
  const [openFamilies, setOpenFamilies] = useState(new Set());
  const [activePills, setActivePills] = useState(new Set());

  if (!fitment?.length) {
    return (
      <div style={{ background: P.bg, border: `1px solid ${P.border}`, padding: '20px 20px', minHeight: 120 }}>
        <Empty>No fitment data on file.</Empty>
      </div>
    );
  }

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
    openFamilies.add(firstFamily);
  }

  function toggleFamily(name) {
    setOpenFamilies(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  function togglePill(family) {
    setActivePills(prev => {
      const next = new Set(prev);
      if (next.has(family)) {
        next.delete(family);
      } else {
        next.add(family);
        // auto-open the accordion for this family
        setOpenFamilies(o => new Set([...o, family]));
      }
      return next;
    });
  }

  const q = query.trim().toLowerCase();

  // Apply pill filter first, then text search
  const pillFiltered = activePills.size > 0
    ? groups.filter(g => activePills.has(g.family))
    : groups;

  const filteredGroups = q
    ? pillFiltered
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
    : pillFiltered;

  const totalModels = filteredGroups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div style={{
      background: P.bg,
      border: `1px solid ${P.border}`,
      padding: '20px 20px',
    }}>

      <SectionLabel>Verified Fitment</SectionLabel>

      {/* Family pills */}
      {groups.length > 1 && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 7,
          margin: '10px 0 16px',
          paddingBottom: 16,
          borderBottom: `1px solid ${P.border}`,
        }}>
          {groups.map(g => {
            const on = activePills.has(g.family);
            return (
              <button
                key={g.family}
                onClick={() => togglePill(g.family)}
                style={{
                  fontFamily: 'var(--font-stencil)',
                  fontSize: 11,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: on ? '#f0e8d8' : P.inkDim,
                  background: on ? P.pillOn : 'rgba(0,0,0,0.05)',
                  border: `1px solid ${on ? P.pillOn : P.border}`,
                  padding: '7px 14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                {g.family}
                <span style={{
                  fontSize: 9,
                  color: on ? 'rgba(240,232,216,0.7)' : P.inkMuted,
                  background: on ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.07)',
                  border: `1px solid ${on ? 'rgba(0,0,0,0.15)' : P.border}`,
                  padding: '1px 6px',
                  lineHeight: 1.6,
                }}>
                  {g.rows.length}
                </span>
              </button>
            );
          })}
          {activePills.size > 0 && (
            <button
              onClick={() => setActivePills(new Set())}
              style={{
                fontFamily: 'var(--font-stencil)',
                fontSize: 10,
                letterSpacing: '0.10em',
                color: P.inkMuted,
                background: 'transparent',
                border: `1px solid ${P.border}`,
                padding: '7px 12px',
                cursor: 'pointer',
                transition: 'color 0.15s',
              }}
            >
              × Clear
            </button>
          )}
        </div>
      )}

      {/* Search + summary row */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, marginTop: groups.length > 1 ? 0 : 10 }}>
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
            color: P.ink,
            background: 'rgba(0,0,0,0.06)',
            border: `1px solid ${P.border}`,
            borderRadius: 0,
            outline: 'none',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => e.target.style.borderColor = P.borderOn}
          onBlur={e => e.target.style.borderColor = P.border}
        />
        <div style={{
          fontFamily: 'var(--font-stencil)',
          fontSize: 9,
          color: P.inkMuted,
          letterSpacing: '0.08em',
          whiteSpace: 'nowrap',
        }}>
          {totalModels} {totalModels === 1 ? 'MODEL' : 'MODELS'}
        </div>
      </div>

      {/* Family accordion list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 480, overflowY: 'auto' }}>
        {filteredGroups.length === 0 && (
          <div style={{ fontFamily: 'var(--font-stencil)', fontSize: 10, color: P.inkMuted, letterSpacing: '0.08em', padding: '16px 0' }}>
            No matching fitment.
          </div>
        )}

        {filteredGroups.map(group => {
          const isOpen = q ? true : openFamilies.has(group.family);
          return (
            <div key={group.family} style={{
              border: `1px solid ${isOpen ? P.borderOn : P.border}`,
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
                  padding: '13px 16px',
                  cursor: q ? 'default' : 'pointer',
                  background: isOpen ? P.headerOn : P.header,
                  border: 'none',
                  borderBottom: isOpen ? `1px solid ${P.border}` : 'none',
                  textAlign: 'left',
                  gap: 12,
                  transition: 'background 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    width: 3,
                    height: 16,
                    flexShrink: 0,
                    background: isOpen ? P.gold : P.inkMuted,
                    display: 'inline-block',
                    transition: 'background 0.15s',
                  }} />
                  <span style={{
                    fontFamily: 'var(--font-stencil)',
                    fontSize: 13,
                    color: isOpen ? P.gold : P.inkDim,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                  }}>
                    {group.family}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-stencil)',
                    fontSize: 9,
                    color: P.inkMuted,
                    letterSpacing: '0.06em',
                    background: 'rgba(0,0,0,0.07)',
                    border: `1px solid ${P.border}`,
                    padding: '2px 7px',
                  }}>
                    {group.rows.length}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    fontFamily: 'var(--font-stencil)',
                    fontSize: 10,
                    color: P.inkMuted,
                    letterSpacing: '0.06em',
                  }}>
                    {Math.min(...group.rows.map(r => r.year_from))}
                    {' – '}
                    {Math.max(...group.rows.map(r => r.year_to))}
                  </span>
                  {!q && (
                    <span style={{
                      color: isOpen ? P.gold : P.inkMuted,
                      fontSize: 12,
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
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 16,
                      padding: '11px 16px 11px 25px',
                      background: i % 2 === 0 ? P.bg : P.bgAlt,
                      borderTop: i > 0 ? `1px solid ${P.border}` : 'none',
                    }}>

                      {/* Model name inline with year */}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                        <span style={{
                          fontFamily: 'var(--font-stencil)',
                          fontSize: 13,
                          color: P.ink,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          fontWeight: 600,
                        }}>
                          {row.model_name || row.model_code}
                        </span>
                        <span style={{
                          fontFamily: 'var(--font-stencil)',
                          fontSize: 11,
                          color: P.gold,
                          letterSpacing: '0.06em',
                          background: 'rgba(122,94,20,0.10)',
                          border: `1px solid rgba(122,94,20,0.22)`,
                          padding: '3px 10px',
                          whiteSpace: 'nowrap',
                        }}>
                          {row.year_from === row.year_to
                            ? row.year_from
                            : `${row.year_from} – ${row.year_to}`}
                        </span>
                      </div>

                      {/* Model code below name */}
                      {row.model_name && row.model_code && (
                        <span style={{
                          fontFamily: 'var(--font-stencil)',
                          fontSize: 9,
                          color: P.goldDim,
                          letterSpacing: '0.10em',
                          whiteSpace: 'nowrap',
                        }}>
                          {row.model_code}
                        </span>
                      )}
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

// ── Shared helpers ────────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div style={{
      fontFamily: 'var(--font-stencil)',
      fontSize: 8,
      color: P.goldDim,
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
      color: P.inkMuted,
      letterSpacing: '0.08em',
      padding: '16px 0',
    }}>
      {children}
    </div>
  );
}
