'use client';
import { useState } from 'react';

const TABS = ['DETAILS', 'OEM', 'FITMENT'];

export default function PDPTabs({ fitment, oemRows, details }) {
  const defaultTab = details ? 'DETAILS' : fitment?.length ? 'FITMENT' : 'OEM';
  const [active, setActive] = useState(defaultTab);

  return (
    <div style={{ padding: '28px 28px 0' }}>

      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e6dcc0' }}>
        {TABS.map(tab => {
          const isActive = active === tab;
          return (
            <button
              key={tab}
              onClick={() => setActive(tab)}
              style={{
                padding: '9px 20px',
                fontFamily: 'var(--font-stencil)',
                fontSize: 10,
                letterSpacing: '0.12em',
                color: isActive ? '#1a1208' : '#a89878',
                background: isActive ? '#ffffff' : 'transparent',
                border: '1px solid',
                borderColor: isActive ? '#e6dcc0' : 'transparent',
                borderBottom: isActive ? '2px solid #ffffff' : '1px solid transparent',
                marginBottom: -2,
                cursor: 'pointer',
                borderRadius: '6px 6px 0 0',
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
        background: '#ffffff',
        border: '1px solid #e6dcc0',
        borderTop: 'none',
        borderRadius: '0 6px 6px 6px',
        padding: '20px 24px',
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
      gap: 24,
      alignItems: 'start',
    }}>

      {/* Left: description + features + tech note */}
      <div>
        {description && (
          <p style={{
            fontFamily: 'var(--font-bespoke)',
            fontSize: 14,
            color: '#2a2010',
            lineHeight: 1.65,
            margin: '0 0 16px',
          }}>
            {description}
          </p>
        )}

        {features?.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {features.map((f, i) => (
              <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ color: '#c9a84c', fontSize: 12, lineHeight: '1.6', flexShrink: 0 }}>›</span>
                <span style={{ fontFamily: 'var(--font-bespoke)', fontSize: 13, color: '#3a2e1a', lineHeight: 1.55 }}>
                  {f}
                </span>
              </li>
            ))}
          </ul>
        )}

        {tech_note && (
          <div style={{
            marginTop: (description || features?.length) ? 16 : 0,
            padding: '10px 14px',
            background: '#fdf6e3',
            border: '1px solid #e6dcc0',
            borderLeft: '3px solid #c9a84c',
            borderRadius: 6,
          }}>
            <div style={{
              fontFamily: 'var(--font-stencil)',
              fontSize: 9,
              color: '#8a7040',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: 5,
            }}>
              Tech Note
            </div>
            <div style={{ fontFamily: 'var(--font-bespoke)', fontSize: 13, color: '#2a2010', lineHeight: 1.55 }}>
              {tech_note}
            </div>
          </div>
        )}
      </div>

      {/* Right: attributes */}
      {hasAttrs && (
        <div style={{ minWidth: 180, borderLeft: '1px solid #e6dcc0', paddingLeft: 24 }}>
          <div style={{
            fontFamily: 'var(--font-stencil)',
            fontSize: 9,
            color: '#8a7040',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: 10,
          }}>
            Specifications
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(attributes).map(([key, val]) => (
              <div key={key}>
                <div style={{
                  fontFamily: 'var(--font-stencil)',
                  fontSize: 9,
                  color: '#a89878',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  marginBottom: 2,
                }}>
                  {key}
                </div>
                <div style={{ fontFamily: 'var(--font-bespoke)', fontSize: 13, color: '#2a2010', fontWeight: 600 }}>
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
        <div style={{ marginBottom: secondary.length ? 16 : 0 }}>
          <div style={{
            fontFamily: 'var(--font-stencil)',
            fontSize: 9,
            color: '#8a7040',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}>
            HD OEM Numbers
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {primary.map((r, i) => (
              <span key={i} style={{
                fontFamily: 'var(--font-stencil)',
                fontSize: 12,
                color: '#7a5810',
                background: '#fdf6e3',
                border: '1px solid #c9a84c',
                borderRadius: 4,
                padding: '4px 10px',
                letterSpacing: '0.05em',
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
            fontSize: 9,
            color: '#8a7040',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}>
            Cross Reference
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {secondary.map((r, i) => (
              <span key={i} style={{
                fontFamily: 'var(--font-stencil)',
                fontSize: 11,
                color: '#8a7040',
                background: '#f5f0e8',
                border: '1px solid #e6dcc0',
                borderRadius: 4,
                padding: '3px 8px',
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 340, overflowY: 'auto' }}>
      {fitment.map((row, i) => (
        <div key={i} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '5px 0',
          borderBottom: '1px solid #f0e8d4',
        }}>
          <span style={{
            fontFamily: 'var(--font-stencil)',
            fontSize: 11,
            color: '#7a5810',
            letterSpacing: '0.04em',
            flex: '0 0 auto',
          }}>
            {row.model_name ? `${row.model_name} (${row.model_code})` : row.model_code}
          </span>
          <span style={{ fontFamily: 'var(--font-stencil)', fontSize: 11, color: '#8a7040' }}>
            {row.year_from === row.year_to ? row.year_from : `${row.year_from}–${row.year_to}`}
          </span>
          <span style={{ fontFamily: 'var(--font-stencil)', fontSize: 10, color: '#5a7a5a', marginLeft: 'auto' }}>
            ✓
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Helper ────────────────────────────────────────────────────────────────────

function Empty({ children }) {
  return (
    <div style={{
      fontFamily: 'var(--font-stencil)',
      fontSize: 11,
      color: '#a89878',
      letterSpacing: '0.06em',
    }}>
      {children}
    </div>
  );
}
