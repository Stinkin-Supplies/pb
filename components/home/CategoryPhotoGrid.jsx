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

import { useRouter } from 'next/navigation';
import { useRef, useEffect, useState, useCallback } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import OptionWheel from './OptionWheel';
import SmokeBlob from './SmokeBlob';

// ── Category data — verified against live display_category values ──────────
const CATEGORIES = [
  { label: 'Engine',                        href: '/browse?display_category=Engine',                                      img: '/images/categories/engine.png' },
  { label: 'Foot Controls & Pegs',          href: '/browse?display_category=Foot+Controls+%26+Pegs',                     img: '/images/categories/foot-controls.png', imgPosition: 'center 15%' },
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

// ── Category tile (button, opens modal) ────────────────────────────────────
// Rendered as a stamped brass "data plate" button. The category art is used
// as a CSS mask so it can be tinted to match the nav bar's brass gold,
// scaled up to fill the icon area — the tile's rounded, overflow-hidden
// edge clips anything that runs past the button.
function CategoryTile({ label, href, img, imgPosition, variant, onClick }) {
  const tileClass = variant === 'light' ? 'cpg-tile cpg-tile-light' : 'cpg-tile';
  return (
    <button type="button" className={tileClass} onClick={onClick} aria-label={`Browse ${label}`}>
      <div className="cpg-plate" aria-hidden="true" />
      <div className="cpg-icon-wrap">
        {img ? (
          <div
            className="cpg-icon"
            style={{
              WebkitMaskImage: `url(${img})`,
              maskImage: `url(${img})`,
              WebkitMaskPosition: imgPosition,
              maskPosition: imgPosition,
            }}
            aria-hidden="true"
          />
        ) : (
          <div className="cpg-icon-placeholder" aria-hidden="true" />
        )}
      </div>
      <div className="cpg-scrim" aria-hidden="true" />
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
  const router = useRouter();

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

  // Clicking a word in the option wheel navigates immediately — no need to
  // scroll it to center first.
  const goToSubcat = useCallback(
    (_index, name) => {
      if (!active) return;
      router.push(buildSubcatHref(active.label, name));
      close();
    },
    [active, router, close]
  );

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

        {/* Paper grain texture — sits behind ident row + grid */}
        <div className="cpg-paper-grain" aria-hidden="true" />

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
              {/* Minimal header — just the category name + close */}
              <div className="cpg-modal-header">
                <div className="cpg-modal-title">{active.label}</div>
                <button type="button" className="cpg-modal-close" onClick={close} aria-label="Close">
                  <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
                    <line x1="2" y1="2" x2="16" y2="16" stroke="currentColor" strokeWidth="1.5"/>
                    <line x1="16" y1="2" x2="2" y2="16" stroke="currentColor" strokeWidth="1.5"/>
                  </svg>
                </button>
              </div>

              {/* Subcategory option wheel — dark smoke behind it, click a
                  word to go straight there */}
              <div className="cpg-modal-stack-area">
                <SmokeBlob className="cpg-smoke-blob" />

                {loading && (
                  <div className="cpg-modal-loading">
                    <span className="cpg-modal-loading-text">LOADING…</span>
                  </div>
                )}

                {!loading && subcats.length > 0 && (
                  <OptionWheel
                    key={active.label}
                    className="cpg-subcat-wheel"
                    items={subcats.map(sub => sub.name)}
                    defaultSelected={0}
                    onItemClick={goToSubcat}
                    textColor="rgba(240,232,216,0.40)"
                    activeColor="var(--gold-bright)"
                    side="left"
                    fontSize={2.4}
                    spacing={1.3}
                    curve={1}
                    tilt={9}
                    blur={1.5}
                    fade={0.32}
                    minOpacity={0.18}
                    inset={20}
                    loop={false}
                  />
                )}

                {!loading && subcats.length === 0 && (
                  <div className="cpg-modal-loading">
                    <span className="cpg-modal-loading-text">NO SUBCATEGORIES FOUND</span>
                  </div>
                )}
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`

        /* ── Section wrapper — aged paper background ──────────────────── */
        .cpg-wrap {
          position: relative;
          background: var(--cream);
          overflow: hidden;
        }

        /* Subtle paper grain texture — behind ident row + grid */
        .cpg-paper-grain {
          position: absolute;
          inset: 0;
          background-image:
            url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
          pointer-events: none;
          z-index: 0;
          opacity: 0.6;
        }

        /* ── Section ident row ────────────────────────────────────────── */
        .cpg-ident-row {
          position: relative;
          z-index: 1;
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
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
          background: transparent;
          padding: 0 clamp(20px, 4vw, 56px) 40px;
        }
        .cpg-col {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        /* ── Category tile — stamped brass button ─────────────────────── */
        .cpg-tile {
          position: relative;
          display: block;
          width: 100%;
          height: clamp(200px, 18vw, 300px);
          overflow: hidden;
          background: #0c0a06;
          border: none;
          border-radius: 18px;
          padding: 0;
          cursor: pointer;
          box-shadow:
            0 10px 22px rgba(0,0,0,0.45),
            0 2px 6px rgba(0,0,0,0.35);
          transform: translateY(0);
          transition: box-shadow 0.25s ease, transform 0.25s ease;
        }
        .cpg-tile:hover {
          box-shadow:
            0 16px 32px rgba(0,0,0,0.50),
            0 3px 8px rgba(0,0,0,0.40);
          transform: translateY(-3px);
        }
        .cpg-tile:active {
          box-shadow:
            0 4px 10px rgba(0,0,0,0.40),
            0 1px 2px rgba(0,0,0,0.35);
          transform: translateY(1px);
        }
        .cpg-tile::after {
          content: '';
          position: absolute;
          left: 0; right: 0; bottom: 0;
          height: 3px;
          background: rgba(255,255,255,0.85);
          transition: background 0.25s;
          pointer-events: none;
          z-index: 3;
        }
        .cpg-tile:hover::after {
          background: #c9a84c;
        }

        /* Plate surface — dark antique brass, with a raised-button bevel:
           light catch along the top edge, dark falloff along the bottom */
        .cpg-plate {
          position: absolute;
          inset: 0;
          z-index: 0;
          background:
            repeating-linear-gradient(
              98deg,
              rgba(255,255,255,0.03) 0px,
              transparent 1px,
              transparent 3px
            ),
            linear-gradient(150deg, #4a3a18 0%, #2e2410 55%, #1c160a 100%);
          box-shadow:
            inset 0 1.5px 0 rgba(255,220,150,0.20),
            inset 0 -14px 24px rgba(0,0,0,0.45),
            inset 0 10px 18px rgba(0,0,0,0.20);
          transition: box-shadow 0.3s;
        }
        .cpg-tile:hover .cpg-plate {
          box-shadow:
            inset 0 1.5px 0 rgba(255,220,150,0.28),
            inset 0 -14px 24px rgba(0,0,0,0.36),
            inset 0 10px 18px rgba(0,0,0,0.16);
        }
        .cpg-tile:active .cpg-plate {
          box-shadow:
            inset 0 2px 10px rgba(0,0,0,0.45),
            inset 0 -2px 0 rgba(255,220,150,0.12);
        }

        /* Icon area — fills the whole plate; label overlays on top of it
           at the bottom, lifted by the scrim below rather than pushed into
           its own panel. overflow hidden so the zoomed icon clips at the
           button's own edge rather than spilling past it. */
        .cpg-icon-wrap {
          position: absolute;
          inset: 0;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        /* Artwork used as a CSS mask, tinted a light brass gold (lighter
           version of the nav bar's --gold) instead of its raw yellow.
           Source PNGs carry a lot of built-in transparent margin, so a
           zoom is needed for the part illustration itself to actually fill
           the button — excess is clipped by cpg-icon-wrap/cpg-tile, never
           overflowing the button's rounded edge. */
        .cpg-icon {
          width: 100%;
          height: 100%;
          -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
          -webkit-mask-position: center;
          mask-position: center;
          -webkit-mask-size: cover;
          mask-size: cover;
          transform: scale(1.125);
          background: linear-gradient(155deg, #e6cf6e 0%, var(--gold-bright) 100%);
          filter: drop-shadow(1.5px 2px 2px rgba(0,0,0,0.55));
          transition: transform 0.5s cubic-bezier(0.22,0.61,0.36,1);
        }
        .cpg-tile:hover .cpg-icon {
          transform: scale(1.18);
        }
        .cpg-icon-placeholder {
          width: 60%;
          height: 60%;
          border: 1px dashed rgba(197,167,34,0.20);
        }

        /* Scrim — soft dark shadow rising from the bottom edge, standing in
           for a solid text panel so the label reads over the artwork */
        .cpg-scrim {
          position: absolute;
          left: 0; right: 0; bottom: 0;
          height: 62%;
          z-index: 1;
          background: linear-gradient(to top, rgba(8,7,6,0.88) 0%, rgba(8,7,6,0.50) 35%, rgba(8,7,6,0) 100%);
          pointer-events: none;
        }

        .cpg-corner {
          position: absolute;
          top: 14px; left: 14px;
          width: 14px; height: 14px;
          border-top: 1.5px solid rgba(197,167,34,0.35);
          border-left: 1.5px solid rgba(197,167,34,0.35);
          pointer-events: none;
          transition: border-color 0.3s;
          z-index: 2;
        }
        .cpg-tile:hover .cpg-corner { border-color: rgba(197,167,34,0.70); }
        .cpg-content {
          position: absolute;
          z-index: 2;
          left: 0; right: 0; bottom: 0;
          padding: 0 18px 16px;
          text-align: left;
        }
        .cpg-label {
          font-family: var(--font-tanker), sans-serif;
          font-size: clamp(30px, 4.2vw, 52px);
          font-weight: 400;
          line-height: 0.92;
          letter-spacing: -0.005em;
          text-transform: uppercase;
          color: #f0e8d8;
          text-shadow: 0 2px 14px rgba(0,0,0,0.7);
          margin-bottom: 8px;
          transition: color 0.2s;
        }
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

        /* ── Light tile variant — slightly lighter dark brass (checkerboard
           partner to the main plate — still a darker gold/brass, not pale) */
        .cpg-tile-light .cpg-plate {
          background:
            repeating-linear-gradient(
              98deg,
              rgba(255,255,255,0.05) 0px,
              transparent 1px,
              transparent 3px
            ),
            linear-gradient(150deg, #6b5220 0%, #47350f 55%, #2e2109 100%);
          box-shadow:
            inset 0 1.5px 0 rgba(255,220,150,0.22),
            inset 0 -14px 24px rgba(0,0,0,0.40),
            inset 0 10px 18px rgba(0,0,0,0.16);
        }
        .cpg-tile-light:hover .cpg-plate {
          box-shadow:
            inset 0 1.5px 0 rgba(255,220,150,0.30),
            inset 0 -14px 24px rgba(0,0,0,0.32),
            inset 0 10px 18px rgba(0,0,0,0.12);
        }
        .cpg-tile-light .cpg-icon-placeholder {
          border-color: rgba(197,167,34,0.25);
        }
        .cpg-tile-light .cpg-cta-text,
        .cpg-tile-light .cpg-cta-arrow {
          color: #d4b860;
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

        /* ── Modal panel — minimal, no border/eyebrow/dividers ──────────── */
        .cpg-modal {
          position: relative;
          width: 100%;
          max-width: 780px;
          background: #100e09;
          box-shadow: 0 24px 64px rgba(0,0,0,0.55);
          overflow: hidden;
        }

        /* Minimal header — just the category name + close */
        .cpg-modal-header {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          padding: 24px 24px 0;
        }
        .cpg-modal-title {
          font-family: var(--font-tanker), sans-serif;
          font-size: clamp(28px, 4.4vw, 44px);
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
          width: 30px;
          height: 30px;
          color: rgba(197,167,34,0.50);
          cursor: pointer;
          transition: color 0.15s;
        }
        .cpg-modal-close:hover {
          color: rgba(197,167,34,0.90);
        }

        /* ── Stack area — dark smoke behind the subcategory option wheel ── */
        .cpg-modal-stack-area {
          position: relative;
          padding: 8px 0 16px;
          height: 340px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .cpg-smoke-blob {
          z-index: 0;
        }
        .cpg-subcat-wheel {
          position: relative;
          z-index: 1;
          flex: 1;
          min-height: 0;
        }
        .cpg-subcat-wheel .option-wheel__item {
          font-family: var(--font-tanker), sans-serif;
          text-transform: uppercase;
          letter-spacing: -0.005em;
        }
        .cpg-modal-loading {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
        }
        .cpg-modal-loading-text {
          font-family: var(--font-stencil), monospace;
          font-size: 9px;
          letter-spacing: 0.18em;
          color: rgba(197,167,34,0.30);
          text-transform: uppercase;
        }

        /* ── Responsive ───────────────────────────────────────────────── */
        @media (max-width: 768px) {
          .cpg-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 480px) {
          .cpg-tile { height: 160px; }
          .cpg-label { font-size: 16px; }
        }
      `}</style>
    </>
  );
}
