'use client';

/**
 * CategoryPhotoGrid — parallax category grid + LayeredStack subcategory picker
 *
 * Click a category tile → modal opens with subcategory cards stacked in a pile.
 * Hover the stack → cards fan out. Click a card → browse that subcategory.
 *
 * Adding images:
 *   Drop files into /public/images/categories/ and set the `img` field below.
 */

import Link from 'next/link';
import { useRef, useEffect, useState, useCallback } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';

// ── Category data — verified against live display_category values ──────────
const CATEGORIES = [
  { label: 'Engine',                        href: '/browse?display_category=Engine',                                      img: '/images/categories/engine.png' },
  { label: 'Foot Controls & Pegs',          href: '/browse?display_category=Foot+Controls+%26+Pegs',                     img: '/images/categories/foot-controls.png' },
  { label: 'Transmission & Clutch',         href: '/browse?display_category=Transmission+%26+Clutch',                    img: '/images/categories/transmission.png' },
  { label: 'Handlebars & Hand Controls',    href: '/browse?display_category=Handlebars+%26+Hand+Controls',               img: '/images/categories/handlebars.png' },
  { label: 'Brakes',                        href: '/browse?display_category=Brakes',                                      img: '/images/categories/brakes.png' },
  { label: 'Riding Gear & Apparel',         href: '/browse?display_category=Riding+Gear+%26+Apparel',                    img: null },
  { label: 'Cables',                        href: '/browse?display_category=Cables',                                      img: null },
  { label: 'Gaskets & Seals',               href: '/browse?display_category=Gaskets+%26+Seals',                          img: null },
  { label: 'Fuel, Air & Carburetors',       href: '/browse?display_category=Fuel%2C+Air+%26+Carburetors',                img: '/images/categories/fuel-air-carburetors.png' },
  { label: 'Tanks & Body',                  href: '/browse?display_category=Tanks+%26+Body',                             img: '/images/categories/tanks-body.png' },
  { label: 'Lighting',                      href: '/browse?display_category=Lighting',                                    img: '/images/categories/lighting.png' },
  { label: 'Frames & Suspension',           href: '/browse?display_category=Frames+%26+Suspension',                      img: '/images/categories/frames-suspension.png' },
  { label: 'Wheels & Tires',                href: '/browse?display_category=Wheels+%26+Tires',                           img: '/images/categories/wheels-tires.png' },
  { label: 'Seating',                       href: '/browse?display_category=Seating',                                     img: null },
  { label: 'Electrical',                    href: '/browse?display_category=Electrical',                                  img: '/images/categories/electrical.png' },
  { label: 'Exhaust',                       href: '/browse?display_category=Exhaust',                                     img: '/images/categories/exhaust.png' },
  { label: 'Hardware',                      href: '/browse?display_category=Hardware',                                    img: '/images/categories/hardware.png' },
  { label: 'Accessories & Gear',            href: '/browse?display_category=Accessories+%26+Gear',                       img: null },
  { label: 'Tools & Chemicals',             href: '/browse?display_category=Tools+%26+Chemicals',                        img: null },
  { label: 'Saddlebags, Sissy Bars & Luggage', href: '/browse?display_category=Saddlebags%2C+Sissy+Bars+%26+Luggage',   img: null },
  { label: 'Windshields & Fairings',        href: '/browse?display_category=Windshields+%26+Fairings',                   img: '/images/categories/windshields-fairings.png' },
  { label: 'Dashes & Gauges',               href: '/browse?display_category=Dashes+%26+Gauges',                          img: '/images/categories/dashes-gauges.png' },
];

const col1 = CATEGORIES.slice(0, 8);
const col2 = CATEGORIES.slice(8, 15);
const col3 = CATEGORIES.slice(15, 22);

function buildSubcatHref(categoryLabel, subcatName) {
  const params = new URLSearchParams({ display_category: categoryLabel });
  if (subcatName && subcatName !== '(General)') params.set('display_subcategory', subcatName);
  return `/browse?${params.toString()}`;
}

// ── SubcatGrid — stagger-animated card grid, always clickable ─────────────
const cardVariants = {
  hidden: { opacity: 0, y: 28, scale: 0.92, rotate: -2 },
  show:   (i) => ({
    opacity: 1, y: 0, scale: 1, rotate: 0,
    transition: { delay: i * 0.055, duration: 0.38, ease: [0.22, 0.61, 0.36, 1] },
  }),
};

function SubcatGrid({ subcats, categoryLabel, onClose }) {
  return (
    <div className="ls-container">
      {subcats.map((sub, i) => (
        <motion.div
          key={sub.name}
          custom={i}
          variants={cardVariants}
          initial="hidden"
          animate="show"
        >
          <Link
            href={buildSubcatHref(categoryLabel, sub.name)}
            className="cpg-subcat-card"
            onClick={onClose}
          >
            <div className="cpg-subcat-corner" aria-hidden="true" />
            <div className="cpg-subcat-name">{sub.name}</div>
            <div className="cpg-subcat-count">{sub.count.toLocaleString()} parts</div>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}

// ── Category tile (button, opens modal) ───────────────────────────────────
function CategoryTile({ label, href, img, variant, onClick }) {
  const tileClass = variant === 'light' ? 'cpg-tile cpg-tile-light' : 'cpg-tile';
  return (
    <button type="button" className={tileClass} onClick={onClick} aria-label={`Browse ${label}`}>
      {img ? (
        <img src={img} alt="" aria-hidden="true" className="cpg-img" />
      ) : (
        <div className="cpg-placeholder" aria-hidden="true" />
      )}
      <div className="cpg-overlay" aria-hidden="true" />
      <div className="cpg-corner" aria-hidden="true" />
      <div className="cpg-content">
        <div className="cpg-label">{label}</div>
        <div className="cpg-cta">
          <span className="cpg-cta-text">SELECT CATEGORY</span>
          <span className="cpg-cta-arrow">→</span>
        </div>
      </div>
    </button>
  );
}

// ── Main export ────────────────────────────────────────────────────────────
export default function CategoryPhotoGrid() {
  const ref = useRef(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });

  const y1 = useTransform(scrollYProgress, [0, 1], [100, -700]);
  const y2 = useTransform(scrollYProgress, [0, 1], [-100, 700]);
  const y3 = useTransform(scrollYProgress, [0, 1], [100, -700]);

  // ── Modal state ──────────────────────────────────────────────────────────
  const [active, setActive]   = useState(null); // { label, href }
  const [subcats, setSubcats] = useState([]);
  const [loading, setLoading] = useState(false);

  const openCategory = useCallback((cat) => {
    setActive(cat);
    setSubcats([]);
    setLoading(true);
    fetch(`/api/browse/subcategories?category=${encodeURIComponent(cat.label)}`)
      .then(r => r.json())
      .then(d => {
        const sorted = [...(d.subcategories || [])].sort((a, b) => a.name.localeCompare(b.name));
        setSubcats(sorted);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const close = useCallback(() => setActive(null), []);

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  return (
    <>
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
            {col1.map((cat, i) => <CategoryTile key={cat.label} {...cat} variant={i % 2 === 0 ? 'dark' : 'light'} onClick={() => openCategory(cat)} />)}
          </motion.div>
          <motion.div className="cpg-col" style={{ y: y2 }}>
            {col2.map((cat, i) => <CategoryTile key={cat.label} {...cat} variant={i % 2 === 0 ? 'light' : 'dark'} onClick={() => openCategory(cat)} />)}
          </motion.div>
          <motion.div className="cpg-col" style={{ y: y3 }}>
            {col3.map((cat, i) => <CategoryTile key={cat.label} {...cat} variant={i % 2 === 0 ? 'dark' : 'light'} onClick={() => openCategory(cat)} />)}
          </motion.div>
        </div>

      </section>

      {/* ── Subcategory modal ──────────────────────────────────────────── */}
      <AnimatePresence>
        {active && (
          <motion.div
            className="cpg-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={close}
          >
            <motion.div
              className="cpg-modal"
              initial={{ opacity: 0, y: 48, scale: 0.97 }}
              animate={{ opacity: 1, y: 0,  scale: 1 }}
              exit={{ opacity: 0, y: 32, scale: 0.97 }}
              transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
              onClick={e => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="cpg-modal-header">
                <div className="cpg-modal-title-block">
                  <div className="cpg-modal-eyebrow">SELECT SUBCATEGORY</div>
                  <div className="cpg-modal-title">{active.label}</div>
                </div>
                <button type="button" className="cpg-modal-close" onClick={close} aria-label="Close">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <line x1="2" y1="2" x2="16" y2="16" stroke="currentColor" strokeWidth="1.5"/>
                    <line x1="16" y1="2" x2="2" y2="16" stroke="currentColor" strokeWidth="1.5"/>
                  </svg>
                </button>
              </div>

              {/* Divider */}
              <div className="cpg-modal-rule" />

              {/* LayeredStack of subcategory cards */}
              <div className="cpg-modal-stack-area">
                {loading && (
                  <div className="cpg-modal-loading">
                    <span className="cpg-modal-loading-text">LOADING PARTS DATA…</span>
                  </div>
                )}

                {!loading && subcats.length > 0 && (
                  <>
                    <div className="cpg-stack-hint">SELECT A SUBCATEGORY</div>
                    <SubcatGrid
                      key={active.label}
                      subcats={subcats}
                      categoryLabel={active.label}
                      onClose={close}
                    />
                  </>
                )}

                {!loading && subcats.length === 0 && (
                  <div className="cpg-modal-loading">
                    <span className="cpg-modal-loading-text">NO SUBCATEGORIES FOUND</span>
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="cpg-modal-rule" />

              {/* Footer — browse all link */}
              <div className="cpg-modal-footer">
                <Link href={active.href} className="cpg-browse-all" onClick={close}>
                  BROWSE ALL {active.label.toUpperCase()} →
                </Link>
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`

        /* ── Section wrapper ──────────────────────────────────────────── */
        .cpg-wrap {
          background: var(--coal);
          overflow: hidden;
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

        /* ── Grid ─────────────────────────────────────────────────────── */
        .cpg-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
          background: transparent;
          padding: 0;
        }
        .cpg-col {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        /* ── Category tile ────────────────────────────────────────────── */
        .cpg-tile {
          position: relative;
          display: block;
          width: 100%;
          height: clamp(200px, 18vw, 300px);
          overflow: hidden;
          background: #0c0a06;
          border: none;
          padding: 0;
          cursor: pointer;
        }
        .cpg-tile::after {
          content: '';
          position: absolute;
          left: 0; right: 0; bottom: 0;
          height: 7px;
          background: rgba(255,255,255,0.85);
          clip-path: polygon(
            0% 55%, 3% 20%, 6% 70%, 9% 10%, 12% 60%, 16% 30%, 19% 85%,
            23% 15%, 27% 65%, 31% 5%, 35% 55%, 39% 25%, 43% 75%, 47% 10%,
            51% 60%, 55% 30%, 59% 80%, 63% 15%, 67% 65%, 71% 5%, 75% 50%,
            79% 20%, 83% 70%, 87% 10%, 91% 60%, 95% 25%, 100% 55%,
            100% 100%, 0% 100%
          );
          transition: background 0.25s;
          pointer-events: none;
        }
        .cpg-tile:hover::after {
          background: #c9a84c;
        }
        .cpg-img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          filter: grayscale(15%) brightness(0.70);
          transition: transform 0.55s cubic-bezier(0.22,0.61,0.36,1), filter 0.55s ease;
        }
        .cpg-tile:hover .cpg-img {
          transform: scale(1.06);
          filter: grayscale(0%) brightness(0.58);
        }
        .cpg-placeholder {
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, #28200a 0%, #161209 55%, #0d0a05 100%);
        }
        .cpg-placeholder::after {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(61,90,122,0.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(61,90,122,0.07) 1px, transparent 1px);
          background-size: 36px 36px;
        }
        .cpg-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.22) 40%, rgba(0,0,0,0.80) 100%);
          transition: background 0.4s ease;
        }
        .cpg-tile:hover .cpg-overlay {
          background: linear-gradient(to bottom, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.32) 40%, rgba(0,0,0,0.88) 100%);
        }
        .cpg-corner {
          position: absolute;
          top: 14px; left: 14px;
          width: 14px; height: 14px;
          border-top: 1.5px solid rgba(197,167,34,0.35);
          border-left: 1.5px solid rgba(197,167,34,0.35);
          pointer-events: none;
          transition: border-color 0.3s;
        }
        .cpg-tile:hover .cpg-corner { border-color: rgba(197,167,34,0.70); }
        .cpg-content {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          min-height: 50%;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding: 0 18px 16px;
          text-align: left;
        }
        .cpg-label {
          font-family: var(--font-tanker), sans-serif;
          font-size: clamp(34px, 5.2vw, 72px);
          font-weight: 400;
          line-height: 0.90;
          letter-spacing: -0.01em;
          text-transform: uppercase;
          color: #ffffff;
          text-shadow: 0 2px 16px rgba(0,0,0,0.8);
          margin-bottom: 14px;
          transition: color 0.2s;
        }
        .cpg-tile:hover .cpg-label { color: #ffffff; }
        .cpg-cta {
          display: flex;
          align-items: center;
          gap: 6px;
          opacity: 0;
          transform: translateY(5px);
          transition: opacity 0.25s ease, transform 0.25s ease;
        }
        .cpg-tile:hover .cpg-cta { opacity: 1; transform: translateY(0); }
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
        .cpg-tile:hover .cpg-cta-arrow { transform: translateX(3px); }

        /* ── Light tile variant (alternating checkerboard) ──────────────── */
        .cpg-tile-light .cpg-placeholder {
          background: linear-gradient(135deg, #ded0a4 0%, #cbb98a 55%, #b8a473 100%);
        }
        .cpg-tile-light .cpg-placeholder::after {
          background-image:
            linear-gradient(rgba(74,56,16,0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(74,56,16,0.08) 1px, transparent 1px);
        }
        .cpg-tile-light .cpg-img {
          filter: grayscale(10%) brightness(1.02) sepia(8%);
        }
        .cpg-tile-light:hover .cpg-img {
          filter: grayscale(0%) brightness(1.05) sepia(4%);
        }
        .cpg-tile-light .cpg-overlay {
          background: linear-gradient(to bottom, rgba(245,240,232,0.05) 0%, rgba(245,240,232,0.45) 40%, rgba(238,229,206,0.92) 100%);
        }
        .cpg-tile-light:hover .cpg-overlay {
          background: linear-gradient(to bottom, rgba(245,240,232,0.10) 0%, rgba(245,240,232,0.55) 40%, rgba(238,229,206,0.96) 100%);
        }
        .cpg-tile-light .cpg-corner {
          border-top-color: rgba(26,18,8,0.30);
          border-left-color: rgba(26,18,8,0.30);
        }
        .cpg-tile-light:hover .cpg-corner {
          border-color: rgba(26,18,8,0.55);
        }
        .cpg-tile-light .cpg-label {
          color: #1a1208;
          text-shadow: 0 1px 10px rgba(245,240,232,0.6);
        }
        .cpg-tile-light:hover .cpg-label { color: #1a1208; }
        .cpg-tile-light .cpg-cta-text,
        .cpg-tile-light .cpg-cta-arrow {
          color: #8a6a22;
        }
        .cpg-tile-light::after {
          background: rgba(26,18,8,0.45);
        }
        .cpg-tile-light:hover::after {
          background: #8a6a22;
        }

        /* ── Modal backdrop ───────────────────────────────────────────── */
        .cpg-backdrop {
          position: fixed;
          inset: 0;
          z-index: 900;
          background: rgba(6,5,3,0.80);
          backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }

        /* ── Modal panel ──────────────────────────────────────────────── */
        .cpg-modal {
          position: relative;
          width: 100%;
          max-width: 780px;
          background: #100e09;
          border: 1px solid rgba(197,167,34,0.22);
          box-shadow: 0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(197,167,34,0.06);
          overflow: hidden;
        }

        /* Modal header */
        .cpg-modal-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          padding: 28px 28px 0;
        }
        .cpg-modal-eyebrow {
          font-family: var(--font-stencil), monospace;
          font-size: 8px;
          letter-spacing: 0.20em;
          color: rgba(197,167,34,0.50);
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        .cpg-modal-title {
          font-family: var(--font-tanker), sans-serif;
          font-size: clamp(32px, 5vw, 52px);
          font-weight: 400;
          line-height: 0.92;
          text-transform: uppercase;
          color: #f5f0e8;
        }
        .cpg-modal-close {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          background: rgba(197,167,34,0.06);
          border: 1px solid rgba(197,167,34,0.16);
          color: rgba(197,167,34,0.55);
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
          margin-top: 4px;
        }
        .cpg-modal-close:hover {
          background: rgba(197,167,34,0.14);
          color: rgba(197,167,34,0.90);
        }
        .cpg-modal-rule {
          height: 1px;
          background: rgba(197,167,34,0.12);
          margin: 20px 0 0;
        }

        /* ── Stack area ───────────────────────────────────────────────── */
        .cpg-modal-stack-area {
          padding: 24px 28px;
          min-height: 320px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .cpg-stack-hint {
          font-family: var(--font-stencil), monospace;
          font-size: 8px;
          letter-spacing: 0.16em;
          color: rgba(197,167,34,0.35);
          text-transform: uppercase;
          margin-bottom: 20px;
          text-align: center;
        }
        .cpg-modal-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 200px;
        }
        .cpg-modal-loading-text {
          font-family: var(--font-stencil), monospace;
          font-size: 9px;
          letter-spacing: 0.18em;
          color: rgba(197,167,34,0.30);
          text-transform: uppercase;
        }

        /* ── Subcategory grid ─────────────────────────────────────────── */
        .ls-container {
          width: 100%;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
        }

        /* ── Subcategory card ─────────────────────────────────────────── */
        .cpg-subcat-card {
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          gap: 4px;
          padding: 14px 14px 12px;
          background: #f5f0e8;
          border: 1px solid rgba(139,110,44,0.20);
          text-decoration: none;
          min-height: 96px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.20);
          transition: box-shadow 0.2s, border-color 0.2s;
        }
        .cpg-subcat-card:hover {
          box-shadow: 0 4px 20px rgba(0,0,0,0.30);
          border-color: rgba(197,167,34,0.55);
          z-index: 200 !important;
        }
        .cpg-subcat-corner {
          position: absolute;
          top: 8px; left: 8px;
          width: 10px; height: 10px;
          border-top: 1px solid rgba(139,110,44,0.35);
          border-left: 1px solid rgba(139,110,44,0.35);
          pointer-events: none;
        }
        .cpg-subcat-name {
          font-family: var(--font-tanker), sans-serif;
          font-size: 15px;
          font-weight: 400;
          line-height: 1;
          text-transform: uppercase;
          color: #1a1208;
        }
        .cpg-subcat-count {
          font-family: var(--font-stencil), monospace;
          font-size: 8px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(139,110,44,0.65);
        }

        /* ── Modal footer ─────────────────────────────────────────────── */
        .cpg-modal-footer {
          padding: 16px 28px 24px;
          display: flex;
          justify-content: flex-end;
        }
        .cpg-browse-all {
          font-family: var(--font-stencil), monospace;
          font-size: 9px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(197,167,34,0.60);
          text-decoration: none;
          transition: color 0.15s;
        }
        .cpg-browse-all:hover { color: rgba(197,167,34,0.90); }

        /* ── Responsive ───────────────────────────────────────────────── */
        @media (max-width: 768px) {
          .cpg-grid { grid-template-columns: repeat(2, 1fr); }
          .ls-container { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 480px) {
          .cpg-tile { height: 160px; }
          .cpg-label { font-size: 16px; }
          .ls-container { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
    </>
  );
}
