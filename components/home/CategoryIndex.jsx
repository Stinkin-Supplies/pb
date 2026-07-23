'use client';

/**
 * CategoryIndex — Parts Catalog Table of Contents
 *
 * Styled as the front-matter index of a vintage factory parts catalog:
 * section headers, dot leaders, category entries with part counts.
 * Background: aged paper / cream. Typography: technical manual.
 */

import Link from 'next/link';

const SECTIONS = [
  {
    num: '01',
    title: 'Engine & Drivetrain',
    cats: [
      { label: 'Engine Components',      slug: 'engine' },
      { label: 'Transmission',           slug: 'transmission' },
      { label: 'Clutch & Primary Drive', slug: 'clutch-primary' },
      { label: 'Exhaust Systems',        slug: 'exhaust' },
    ],
  },
  {
    num: '02',
    title: 'Fuel & Induction',
    cats: [
      { label: 'Carburetors & Fuel',     slug: 'fuel-air-carbs' },
      { label: 'Air Cleaners & Intake',  slug: 'air-cleaners' },
      { label: 'Fuel Tanks & Petcocks',  slug: 'fuel-tanks' },
    ],
  },
  {
    num: '03',
    title: 'Controls & Ergonomics',
    cats: [
      { label: 'Handlebars & Controls',  slug: 'handlebars-controls' },
      { label: 'Foot Controls & Pegs',   slug: 'foot-controls-pegs' },
      { label: 'Seating & Seats',        slug: 'seating' },
      { label: 'Grips & Levers',         slug: 'grips-levers' },
    ],
  },
  {
    num: '04',
    title: 'Chassis & Suspension',
    cats: [
      { label: 'Frame & Body Panels',    slug: 'frame-body' },
      { label: 'Forks & Suspension',     slug: 'suspension' },
      { label: 'Brakes',                 slug: 'brakes' },
      { label: 'Wheels & Tires',         slug: 'wheels-tires' },
    ],
  },
  {
    num: '05',
    title: 'Electrical & Lighting',
    cats: [
      { label: 'Electrical & Ignition',  slug: 'electrical' },
      { label: 'Lighting & Signals',     slug: 'lighting' },
      { label: 'Gauges & Instruments',   slug: 'gauges-instruments' },
    ],
  },
  {
    num: '06',
    title: 'Finishing & Accessories',
    cats: [
      { label: 'Gaskets & Seals',        slug: 'gaskets-seals' },
      { label: 'Luggage & Storage',      slug: 'luggage' },
      { label: 'Mirrors & Visibility',   slug: 'mirrors' },
      { label: 'Hardware & Fasteners',   slug: 'hardware' },
    ],
  },
];

function DotLeader() {
  return (
    <span className="ci-dots" aria-hidden="true" />
  );
}

export default function CategoryIndex() {
  return (
    <section className="ci-wrap">

      {/* ── Section header — printed page identifier ── */}
      <div className="ci-page-header">
        <span className="ci-page-ident">STINKIN&apos; SUPPLIES — PARTS CATALOG</span>
        <span className="ci-page-rule" aria-hidden="true" />
        <span className="ci-page-ref">INDEX OF PARTS SECTIONS</span>
      </div>

      {/* ── Main title ── */}
      <div className="ci-title-block">
        <h2 className="ci-title">Parts Index</h2>
        <p className="ci-subtitle">
          Select a section to browse in-stock components, specifications,
          and fitment data for Harley-Davidson applications.
        </p>
      </div>

      {/* ── Index grid ── */}
      <div className="ci-grid">
        {SECTIONS.map(sec => (
          <div key={sec.num} className="ci-section">

            {/* Section header row */}
            <div className="ci-section-head">
              <span className="ci-section-num">{sec.num}</span>
              <span className="ci-section-title">{sec.title}</span>
            </div>

            {/* Category rows */}
            <ul className="ci-entry-list">
              {sec.cats.map(cat => (
                <li key={cat.slug} className="ci-entry">
                  <Link
                    href={`/browse?cat=${cat.slug}`}
                    className="ci-entry-link"
                  >
                    <span className="ci-entry-label">{cat.label}</span>
                    <DotLeader />
                    <span className="ci-entry-arrow">→</span>
                  </Link>
                </li>
              ))}
            </ul>

          </div>
        ))}
      </div>

      {/* ── Footer rule — colophon line ── */}
      <div className="ci-colophon">
        <span className="ci-colophon-rule" aria-hidden="true" />
        <Link href="/browse" className="ci-browse-all">
          BROWSE FULL CATALOG →
        </Link>
        <span className="ci-colophon-rule" aria-hidden="true" />
      </div>

      <style>{`

        /* ── Wrapper — aged paper background ─────────────────────────── */
        .ci-wrap {
          background: var(--cream);
          border-top: 3px solid var(--gold-dim);
          border-bottom: 3px solid var(--gold-dim);
          padding: 56px clamp(24px, 5vw, 80px) 64px;
          position: relative;
          overflow: hidden;
        }

        /* Subtle paper grain texture */
        .ci-wrap::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
          pointer-events: none;
          z-index: 0;
          opacity: 0.6;
        }

        /* Horizontal ruled lines — notebook paper */
        .ci-wrap::after {
          content: '';
          position: absolute;
          inset: 0;
          background-image: repeating-linear-gradient(
            to bottom,
            transparent,
            transparent 31px,
            rgba(139,110,44,0.07) 31px,
            rgba(139,110,44,0.07) 32px
          );
          pointer-events: none;
          z-index: 0;
        }

        /* Everything above the textures */
        .ci-page-header,
        .ci-title-block,
        .ci-grid,
        .ci-colophon {
          position: relative;
          z-index: 1;
        }

        /* ── Page header / identifier ─────────────────────────────────── */
        .ci-page-header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 40px;
        }
        .ci-page-ident {
          font-family: var(--font-stencil), monospace;
          font-size: var(--text-2xs);
          letter-spacing: var(--tracking-stamp);
          color: var(--gold-dim);
          text-transform: uppercase;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .ci-page-rule {
          flex: 1;
          height: 1px;
          background: var(--gold-rule);
        }
        .ci-page-ref {
          font-family: var(--font-stencil), monospace;
          font-size: var(--text-2xs);
          letter-spacing: var(--tracking-stamp);
          color: rgba(139,110,44,0.5);
          text-transform: uppercase;
          white-space: nowrap;
          flex-shrink: 0;
        }

        /* ── Title block ──────────────────────────────────────────────── */
        .ci-title-block {
          margin-bottom: 48px;
          max-width: 520px;
        }
        .ci-title {
          font-family: var(--font-tanker), sans-serif;
          font-size: clamp(48px, 6vw, 88px);
          font-weight: 400;
          line-height: 0.92;
          letter-spacing: -0.01em;
          text-transform: uppercase;
          color: var(--coal);
          margin-bottom: 16px;
          text-shadow:
            0  1px 0 rgba(255,255,255,0.60),
            0 -1px 0 rgba(0,0,0,0.15),
            0  2px 4px rgba(0,0,0,0.12);
        }
        .ci-subtitle {
          font-family: var(--font-body), sans-serif;
          font-size: var(--text-base);
          line-height: var(--leading-relaxed);
          color: var(--fog);
        }

        /* ── Index grid — 3 columns on wide, 2 on mid, 1 on mobile ───── */
        .ci-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0;
          border-top: 2px solid rgba(139,110,44,0.25);
          border-left: 2px solid rgba(139,110,44,0.25);
        }

        /* ── Section block ────────────────────────────────────────────── */
        .ci-section {
          border-right: 2px solid rgba(139,110,44,0.25);
          border-bottom: 2px solid rgba(139,110,44,0.25);
          padding: 24px 28px 28px;
          /* Prevent grid blowout from long text */
          min-width: 0;
          overflow: hidden;
        }

        /* Section header */
        .ci-section-head {
          display: flex;
          align-items: baseline;
          gap: 10px;
          margin-bottom: 16px;
          padding-bottom: 10px;
          border-bottom: 1px solid rgba(139,110,44,0.20);
        }
        .ci-section-num {
          font-family: var(--font-stencil), monospace;
          font-size: var(--text-2xs);
          letter-spacing: var(--tracking-stamp);
          color: var(--gold-dim);
          flex-shrink: 0;
        }
        .ci-section-title {
          font-family: var(--font-tanker), sans-serif;
          font-size: var(--text-lg);
          font-weight: 400;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          color: var(--coal);
          line-height: 1;
          text-shadow: 0 1px 0 rgba(255,255,255,0.5);
          /* Prevent long titles from blowing out the header row */
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* ── Entry list ───────────────────────────────────────────────── */
        .ci-entry-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .ci-entry {
          display: block;
        }
        .ci-entry-link {
          display: flex;
          align-items: baseline;
          gap: 0;
          padding: 5px 0;
          text-decoration: none;
          border-bottom: 1px solid transparent;
          transition: border-color 0.15s;
        }
        .ci-entry-link:hover {
          border-bottom-color: rgba(139,110,44,0.20);
        }
        .ci-entry-label {
          font-family: var(--font-body), sans-serif;
          font-size: var(--text-sm);
          font-weight: 500;
          color: var(--coal);
          white-space: nowrap;
          /* Allow label to shrink and clip rather than blow out the row */
          flex-shrink: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          transition: color 0.15s;
        }
        .ci-entry-link:hover .ci-entry-label {
          color: var(--gold-dim);
        }

        /* Dot leader — fills space between label and arrow */
        .ci-dots {
          flex: 1;
          margin: 0 6px;
          overflow: hidden;
          position: relative;
          top: -2px;
        }
        .ci-dots::after {
          content: '· · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·';
          font-family: var(--font-stencil), monospace;
          font-size: 9px;
          letter-spacing: 3px;
          color: rgba(139,110,44,0.30);
          white-space: nowrap;
        }

        /* Arrow */
        .ci-entry-arrow {
          font-family: var(--font-stencil), monospace;
          font-size: var(--text-xs);
          color: rgba(139,110,44,0.45);
          flex-shrink: 0;
          transition: color 0.15s, transform 0.15s;
          display: inline-block;
        }
        .ci-entry-link:hover .ci-entry-arrow {
          color: var(--gold-dim);
          transform: translateX(3px);
        }

        /* ── Colophon / footer rule ───────────────────────────────────── */
        .ci-colophon {
          margin-top: 48px;
          display: flex;
          align-items: center;
          gap: 24px;
        }
        .ci-colophon-rule {
          flex: 1;
          height: 1px;
          background: rgba(139,110,44,0.25);
        }
        .ci-browse-all {
          font-family: var(--font-stencil), monospace;
          font-size: var(--text-xs);
          letter-spacing: var(--tracking-stamp);
          color: var(--gold-dim);
          text-decoration: none;
          white-space: nowrap;
          transition: color 0.15s;
        }
        .ci-browse-all:hover {
          color: var(--coal);
        }

        /* ── Responsive ───────────────────────────────────────────────── */
        @media (max-width: 960px) {
          .ci-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (max-width: 600px) {
          .ci-grid {
            grid-template-columns: 1fr;
          }
          .ci-wrap {
            padding: 40px 20px 48px;
          }
          .ci-page-ref {
            display: none;
          }
        }
      `}</style>
    </section>
  );
}
