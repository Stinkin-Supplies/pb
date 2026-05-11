'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ERAS } from './eras';

// ─── Era 3D Fan Carousel ─────────────────────────────────────────────────────
function EraCarousel() {
  const router = useRouter();
  const total = ERAS.length;
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const autoRef = useRef(null);
  const touchStartX = useRef(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragDelta = useRef(0);

  // ── Auto-rotate
  const resetAuto = useCallback(() => {
    clearInterval(autoRef.current);
    autoRef.current = setInterval(() => {
      setActive(a => (a + 1) % total);
    }, 3600);
  }, [total]);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    resetAuto();
    return () => clearInterval(autoRef.current);
  }, [resetAuto]);

  const goTo = (idx) => {
    setActive((idx + total) % total);
    resetAuto();
  };

  // ── Drag
  const onMouseDown = (e) => {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragDelta.current = 0;
  };
  const onMouseMove = (e) => {
    if (!isDragging.current) return;
    dragDelta.current = e.clientX - dragStartX.current;
  };
  const onMouseUp = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (Math.abs(dragDelta.current) > 40) {
      goTo(dragDelta.current < 0 ? active + 1 : active - 1);
    }
  };

  // ── Touch swipe
  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) goTo(dx < 0 ? active + 1 : active - 1);
    touchStartX.current = null;
  };

  // ── Card transform — fan bottom-right to top-left
  const getCardStyle = (i) => {
    const diff = ((i - active + total) % total);
    const pos  = diff > total / 2 ? diff - total : diff;
    const absP = Math.abs(pos);

    if (absP > 4) return { display: 'none' };

    // Fixed offsets — no window access (avoids SSR hydration mismatch)
    const unit  = 140; // px per step — tighter spread keeps cards in tile
    const rotZ  = pos * -15;
    const rotX  = 10 + absP * 5;
    const tx    = pos * unit;
    const ty    = pos * unit * 0.72;
    const tz    = -absP * 60;
    const scale = absP === 0 ? 1 : absP === 1 ? 0.88 : absP === 2 ? 0.76 : absP === 3 ? 0.64 : 0.54;
    const op    = absP === 0 ? 1 : absP === 1 ? 0.92 : absP === 2 ? 0.72 : absP === 3 ? 0.48 : 0.26;

    return {
      transform: `translateX(${tx}px) translateY(${ty}px) translateZ(${tz}px) rotateX(${rotX}deg) rotateZ(${rotZ}deg) scale(${scale})`,
      opacity: op,
      zIndex: 20 - absP * 2,
      pointerEvents: absP <= 3 ? 'auto' : 'none',
      cursor: 'pointer',
    };
  };

  if (!mounted) return (
    <div className="carousel-wrap carousel-placeholder" />
  );

  return (
    <div ref={wrapRef} className="carousel-wrap">
      <button
        className="carousel-arrow-lg carousel-arrow-lg--left"
        onClick={() => goTo(active - 1)}
        aria-label="Previous era"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" width="28" height="28">
          <path d="m15 18-6-6 6-6"/>
        </svg>
      </button>

      <div
        className="carousel-stage"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="carousel-scene">
          {ERAS.map((era, i) => {
            const diff = ((i - active + total) % total);
            const pos  = diff > total / 2 ? diff - total : diff;
            const isActive = pos === 0;
            return (
              <div
                key={era.slug}
                className={`era-card ${isActive ? 'era-card--active' : ''}`}
                style={getCardStyle(i)}
                onClick={() => isActive ? router.push(`/era/${era.slug}`) : goTo(i)}
              >
                <div className="era-card-face">
                  <div className="era-card-art"
                    style={{ backgroundImage: era.img ? `url('/images/eras/${era.img}')` : 'none' }}
                  />

                  <div className="era-card-content">
                    <span className="era-card-years">{era.years}</span>
                    <h3 className="era-card-name">{era.name}</h3>
                    {isActive && (
                      <span className="era-card-cta">
                        Shop Parts
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                          <path d="m9 18 6-6-6-6"/>
                        </svg>
                      </span>
                    )}
                  </div>
                  <div className="era-card-corner" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <button
        className="carousel-arrow-lg carousel-arrow-lg--right"
        onClick={() => goTo(active + 1)}
        aria-label="Next era"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" width="28" height="28">
          <path d="m9 18 6-6-6-6"/>
        </svg>
      </button>

      {/* Footer */}
      <div className="carousel-footer">
        <div className="carousel-dots">
          {ERAS.map((era, i) => (
            <button key={era.slug} className={`carousel-dot ${i === active ? 'carousel-dot--active' : ''}`} onClick={() => goTo(i)} aria-label={era.name} />
          ))}
        </div>
      </div>

      <style jsx>{`
        .carousel-placeholder {
          width: 100%;
          min-height: 500px;
          background: #111111;
          border-radius: 16px;
        }
        .carousel-wrap {
          position: relative;
          width: 100%;
          height: 100%;
          min-height: 500px;
          display: flex;
          flex-direction: column;
          user-select: none;
          background: transparent;
          isolation: isolate;
        }
        .carousel-stage {
          position: absolute;
          top: 0;
          bottom: 52px;
          left: 150px;
          right: 150px;
          display: flex;
          align-items: center;
          justify-content: center;
          perspective: 2000px;
          perspective-origin: 55% 50%;
          cursor: grab;
          overflow: visible;
        }
        .carousel-stage:active { cursor: grabbing; }
        .carousel-scene {
          position: relative;
          width: 90%;
          max-width: 880px;
          aspect-ratio: 16/10;
          transform-style: preserve-3d;
          margin-left: 2%;
          margin-top: 3%;
        }
        .era-card {
          position: absolute;
          top: 0; left: 0;
          width: 100%;
          height: 100%;
          transition: transform 0.65s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.55s ease;
          transform-origin: center center;
          will-change: transform, opacity;
        }
        .era-card-face {
          width: 100%;
          height: 100%;
          border-radius: 24px;
          border: 1px solid rgba(255,255,255,0.07);
          background: linear-gradient(145deg, #1e1e1e 0%, #121212 100%);
          overflow: hidden;
          position: relative;
          box-shadow: 0 20px 70px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.04);
          transition: border-color 0.35s, box-shadow 0.35s;
        }
        .era-card--active .era-card-face {
          border-color: rgba(201,168,76,0.6);
          box-shadow: 0 0 0 1px rgba(201,168,76,0.22), 0 32px 100px rgba(0,0,0,0.8), 0 0 140px rgba(201,168,76,0.1);
        }
        .era-card-art {
          position: absolute;
          inset: 0;
          background-size: cover;
          background-position: center;
          opacity: 0.25;
          transition: opacity 0.4s;
        }
        .era-card--active .era-card-art { opacity: 0.48; }
        .era-card-content {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          padding: clamp(18px, 4%, 40px);
          background: linear-gradient(to top, rgba(0,0,0,0.94) 0%, rgba(0,0,0,0.5) 50%, transparent 100%);
        }
        .era-card-years {
          display: block;
          font-family: var(--font-stencil), monospace;
          font-size: clamp(10px, 1.2vw, 13px);
          color: #c9a84c;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        .era-card-name {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: clamp(24px, 4.5vw, 52px);
          font-weight: 700;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          color: #f5f0e8;
          line-height: 1;
          margin: 0;
        }
        .era-card-cta {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          margin-top: clamp(8px, 1.5%, 16px);
          font-family: var(--font-stencil), monospace;
          font-size: clamp(9px, 1vw, 12px);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #c9a84c;
          border: 1px solid #8b6914;
          border-radius: 999px;
          padding: 6px 18px;
          background: rgba(0,0,0,0.5);
          transition: background 0.2s, border-color 0.2s;
          width: fit-content;
        }
        .era-card--active:hover .era-card-cta { background: rgba(201,168,76,0.18); border-color: #c9a84c; }
        .era-card-corner {
          position: absolute;
          top: 18px; right: 18px;
          width: 22px; height: 22px;
          border-top: 2px solid #c9a84c;
          border-right: 2px solid #c9a84c;
          border-radius: 0 6px 0 0;
          opacity: 0;
          transition: opacity 0.3s;
        }
        .era-card--active .era-card-corner { opacity: 1; }
        .carousel-footer {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 52px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
          z-index: 30;
          background: linear-gradient(to top, rgba(10,10,10,0.7) 0%, transparent 100%);
        }
        .carousel-dots {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .carousel-dot {
          width: 5px; height: 5px;
          border-radius: 50%;
          background: rgba(255,255,255,0.18);
          border: none;
          cursor: pointer;
          padding: 0;
          transition: background 0.2s, transform 0.2s;
        }
        .carousel-dot--active { background: #c9a84c; transform: scale(1.6); }
        .carousel-arrow-lg {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 78px;
          height: 78px;
          border-radius: 50%;
          border: 1px solid rgba(201,168,76,0.55);
          background: rgba(10,10,10,0.62);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #c9a84c;
          cursor: pointer;
          z-index: 35;
          transition: background 0.2s, transform 0.2s, border-color 0.2s;
          backdrop-filter: blur(8px);
        }
        .carousel-arrow-lg--left { left: 26px; }
        .carousel-arrow-lg--right { right: 26px; }
        .carousel-arrow-lg:hover {
          background: rgba(201,168,76,0.2);
          border-color: rgba(201,168,76,0.95);
          transform: translateY(-50%) scale(1.06);
        }
        @media (max-width: 768px) {
          .carousel-wrap { min-height: 520px; }
          .carousel-stage { left: 64px; right: 64px; }
          .carousel-scene { width: 88%; margin-left: 0; }
          .carousel-arrow-lg { width: 58px; height: 58px; }
          .carousel-arrow-lg--left { left: 8px; }
          .carousel-arrow-lg--right { right: 8px; }
        }
        @media (max-width: 480px) {
          .carousel-wrap { min-height: 420px; }
          .carousel-stage { left: 44px; right: 44px; }
          .carousel-scene { width: 92%; margin-left: 0; }
          .era-card-face { border-radius: 16px; }
          .carousel-arrow-lg { width: 50px; height: 50px; }
        }
      `}</style>
    </div>
  );
}

export default EraCarousel;
