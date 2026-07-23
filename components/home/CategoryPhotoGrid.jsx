'use client';

/**
 * CategoryPhotoGrid — parallax-scroll category browse section
 *
 * Three columns: col 1 & 3 drift up, col 2 drifts down as the page scrolls.
 * Matches the 21 categories shown on /categories.
 *
 * Adding images:
 *   1. Drop files into /public/images/categories/
 *   2. Set the `img` field below to the path, e.g. '/images/categories/engine.jpg'
 */

import Link from 'next/link';
import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

// ── Category data — 21 entries matching /categories CATEGORY_META ──────────
const CATEGORIES = [
  { label: 'Engine',                href: '/browse?display_category=Engine',                        img: null },
  { label: 'Transmission & Clutch', href: '/browse?display_category=Transmission+%26+Clutch',       img: null },
  { label: 'Exhaust',               href: '/browse?display_category=Exhaust',                       img: null },
  { label: 'Brakes',                href: '/browse?display_category=Brakes',                        img: null },
  { label: 'Electrical',            href: '/browse?display_category=Electrical',                    img: null },
  { label: 'Handlebar & Controls',  href: '/browse?display_category=Handlebar+%26+Controls',        img: null },
  { label: 'Carburetion & Fuel',    href: '/browse?display_category=Carburetion+%26+Fuel',          img: null },
  { label: 'Foot Controls',         href: '/browse?display_category=Foot+Controls',                 img: null },
  { label: 'Lighting',              href: '/browse?display_category=Lighting',                      img: null },
  { label: 'Suspension',            href: '/browse?display_category=Suspension',                    img: null },
  { label: 'Wheels & Tires',        href: '/browse?display_category=Wheels+%26+Tires',              img: null },
  { label: 'Fenders & Body',        href: '/browse?display_category=Fenders+%26+Body',              img: null },
  { label: 'Seating',               href: '/browse?display_category=Seating',                       img: null },
  { label: 'Frame & Hardware',      href: '/browse?display_category=Frame+%26+Hardware',            img: null },
  { label: 'Instrumentation',       href: '/browse?display_category=Instrumentation',               img: null },
  { label: 'Luggage & Racks',       href: '/browse?display_category=Luggage+%26+Racks',             img: null },
  { label: 'Security & Covers',     href: '/browse?display_category=Security+%26+Covers',           img: null },
  { label: 'Oils & Chemicals',      href: '/browse?display_category=Oils+%26+Chemicals',            img: null },
  { label: 'Tools & Chemicals',     href: '/browse?display_category=Tools+%26+Chemicals',           img: null },
  { label: 'Riding Gear & Apparel', href: '/browse?display_category=Riding+Gear+%26+Apparel',       img: null },
  { label: 'Accessories & Misc',    href: '/browse?display_category=Accessories+%26+Misc',          img: null },
];

// Split into 3 columns — 7 / 7 / 7
const col1 = CATEGORIES.slice(0, 7);
const col2 = CATEGORIES.slice(7, 14);
const col3 = CATEGORIES.slice(14, 21);

// ── Single tile ────────────────────────────────────────────────────────────
function CategoryTile({ label, href, img }) {
  return (
    <Link href={href} className="cpg-tile">

      {/* Background image or dark blueprint placeholder */}
      {img ? (
        <img src={img} alt="" aria-hidden="true" className="cpg-img" />
      ) : (
        <div className="cpg-placeholder" aria-hidden="true" />
      )}

      {/* Dark gradient overlay so label always reads */}
      <div className="cpg-overlay" aria-hidden="true" />

      {/* Top-left L-bracket registration mark */}
      <div className="cpg-corner" aria-hidden="true" />

      {/* Text */}
      <div className="cpg-content">
        <div className="cpg-label">{label}</div>
        <div className="cpg-cta">
          <span className="cpg-cta-text">BROWSE PARTS</span>
          <span className="cpg-cta-arrow">→</span>
        </div>
      </div>

    </Link>
  );
}

// ── Main export ────────────────────────────────────────────────────────────
export default function CategoryPhotoGrid() {
  const ref = useRef(null);

  // Track scroll progress as the section moves through the viewport
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });

  // Col 1 & 3 drift upward; col 2 drifts downward
  // Start pre-offset so the stagger is visible as soon as the section enters view
  const y1 = useTransform(scrollYProgress, [0, 1], [400, -900]);
  const y2 = useTransform(scrollYProgress, [0, 1], [-400, 900]);
  const y3 = useTransform(scrollYProgress, [0, 1], [400, -900]);

  return (
    <section className="cpg-wrap" id="parts-index" ref={ref}>

      {/* Section ident */}
      <div className="cpg-ident-row">
        <span className="cpg-rule" />
        <span className="cpg-ident">BROWSE BY CATEGORY</span>
        <span className="cpg-rule" />
      </div>

      {/* 3-column parallax grid */}
      <div className="cpg-grid">
        <motion.div className="cpg-col" style={{ y: y1 }}>
          {col1.map(cat => <CategoryTile key={cat.href} {...cat} />)}
        </motion.div>
        <motion.div className="cpg-col" style={{ y: y2 }}>
          {col2.map(cat => <CategoryTile key={cat.href} {...cat} />)}
        </motion.div>
        <motion.div className="cpg-col" style={{ y: y3 }}>
          {col3.map(cat => <CategoryTile key={cat.href} {...cat} />)}
        </motion.div>
      </div>

      <style>{`

        /* ── Wrapper ──────────────────────────────────────────────────── */
        .cpg-wrap {
          background: var(--coal);
          overflow: hidden; /* clips the parallax overshoot */
        }

        /* ── Section ident row ────────────────────────────────────────── */
        .cpg-ident-row {
          display: flex;
          align-items: center;
          gap: 20px;
          padding: 40px clamp(20px, 4vw, 56px) 32px;
        }
        .cpg-rule {
          flex: 1;
          height: 1px;
          background: var(--gold-rule);
        }
        .cpg-ident {
          font-family: var(--font-stencil), monospace;
          font-size: 9px;
          letter-spacing: 0.18em;
          color: var(--gold-dim);
          text-transform: uppercase;
          white-space: nowrap;
          flex-shrink: 0;
        }

        /* ── Grid — 3 equal columns, 1px gold gap ─────────────────────── */
        .cpg-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0 1px;
          background: rgba(197,167,34,0.14);
          padding: 0 1px 1px;
        }

        /* ── Column — stacks tiles vertically ────────────────────────── */
        .cpg-col {
          display: flex;
          flex-direction: column;
          gap: 1px;
        }

        /* ── Individual tile ──────────────────────────────────────────── */
        .cpg-tile {
          position: relative;
          display: block;
          height: clamp(200px, 18vw, 300px);
          overflow: hidden;
          text-decoration: none;
          background: #0c0a06;
        }

        /* Real image */
        .cpg-img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          filter: grayscale(15%) brightness(0.70);
          transition: transform 0.55s cubic-bezier(0.22, 0.61, 0.36, 1),
                      filter 0.55s ease;
        }
        .cpg-tile:hover .cpg-img {
          transform: scale(1.06);
          filter: grayscale(0%) brightness(0.58);
        }

        /* Placeholder (no image yet) */
        .cpg-placeholder {
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, #28200a 0%, #161209 55%, #0d0a05 100%);
        }
        /* Blueprint grid on placeholder */
        .cpg-placeholder::after {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(61,90,122,0.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(61,90,122,0.07) 1px, transparent 1px);
          background-size: 36px 36px;
        }

        /* Gradient overlay */
        .cpg-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            to bottom,
            rgba(0,0,0,0.08) 0%,
            rgba(0,0,0,0.30) 45%,
            rgba(0,0,0,0.78) 100%
          );
          transition: background 0.4s ease;
        }
        .cpg-tile:hover .cpg-overlay {
          background: linear-gradient(
            to bottom,
            rgba(0,0,0,0.16) 0%,
            rgba(0,0,0,0.42) 45%,
            rgba(0,0,0,0.86) 100%
          );
        }

        /* L-bracket registration mark */
        .cpg-corner {
          position: absolute;
          top: 14px;
          left: 14px;
          width: 14px;
          height: 14px;
          border-top: 1.5px solid rgba(197,167,34,0.35);
          border-left: 1.5px solid rgba(197,167,34,0.35);
          pointer-events: none;
          transition: border-color 0.3s;
        }
        .cpg-tile:hover .cpg-corner {
          border-color: rgba(197,167,34,0.70);
        }

        /* Text content — anchored to bottom */
        .cpg-content {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 0 18px 16px;
        }

        /* Category name */
        .cpg-label {
          font-family: var(--font-tanker), sans-serif;
          font-size: clamp(18px, 2vw, 28px);
          font-weight: 400;
          line-height: 0.95;
          letter-spacing: -0.01em;
          text-transform: uppercase;
          color: #f0e8d8;
          text-shadow: 0 1px 10px rgba(0,0,0,0.7);
          margin-bottom: 10px;
          transition: color 0.2s;
        }
        .cpg-tile:hover .cpg-label {
          color: #ffffff;
        }

        /* Browse CTA — slides up on hover */
        .cpg-cta {
          display: flex;
          align-items: center;
          gap: 6px;
          opacity: 0;
          transform: translateY(5px);
          transition: opacity 0.25s ease, transform 0.25s ease;
        }
        .cpg-tile:hover .cpg-cta {
          opacity: 1;
          transform: translateY(0);
        }
        .cpg-cta-text {
          font-family: var(--font-stencil), monospace;
          font-size: 8px;
          letter-spacing: 0.16em;
          color: #c9a84c;
          text-transform: uppercase;
        }
        .cpg-cta-arrow {
          font-size: 10px;
          color: #c9a84c;
          transition: transform 0.2s ease;
        }
        .cpg-tile:hover .cpg-cta-arrow {
          transform: translateX(3px);
        }

        /* ── Responsive ───────────────────────────────────────────────── */
        @media (max-width: 768px) {
          .cpg-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          /* On mobile the third column stacks below — hide parallax columns,
             show a simple 2-col grid instead */
        }
        @media (max-width: 480px) {
          .cpg-tile {
            height: 160px;
          }
          .cpg-label {
            font-size: 16px;
          }
        }
      `}</style>
    </section>
  );
}
