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
  const [scrollProgress, setScrollProgress] = useState(0);
  const wrapRef = useRef(null);
  const autoRef = useRef(null);
  const touchStartX = useRef(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragDelta = useRef(0);
  const lastScrollIdx = useRef(0);

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

  // ── Scroll-driven advance
  // When the tile is in view, scroll within it advances the active card
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const onWheel = (e) => {
      // Only intercept if tile is roughly centered in viewport
      const rect = el.getBoundingClientRect();
      const inView = rect.top < window.innerHeight * 0.6 && rect.bottom > window.innerHeight * 0.4;
      if (!inView) return;

      e.preventDefault();
      const delta = e.deltaY;

      // Accumulate scroll, advance card every ~120px of scroll
      lastScrollIdx.current += delta;
      if (lastScrollIdx.current > 120) {
        lastScrollIdx.current = 0;
        goTo(active + 1);
      } else if (lastScrollIdx.current < -120) {
        lastScrollIdx.current = 0;
        goTo(active - 1);
      }

      // Also drive a smooth progress value for parallax feel
      setScrollProgress(p => Math.max(0, Math.min(1,
        p + delta / (window.innerHeight * 2)
      )));
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [active, goTo]);

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

    // Subtle extra rotation driven by scroll progress
    const scrollBias = scrollProgress * 4;

    // Fixed offsets — no window access (avoids SSR hydration mismatch)
    const unit  = 140; // px per step — tighter spread keeps cards in tile
    const rotZ  = pos * -15 - (pos !== 0 ? scrollBias * Math.sign(pos) : 0);
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

      {/* Footer */}
      <div className="carousel-footer">
        <button className="carousel-arrow-sm" onClick={() => goTo(active - 1)} aria-label="Previous">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <div className="carousel-dots">
          {ERAS.map((era, i) => (
            <button key={era.slug} className={`carousel-dot ${i === active ? 'carousel-dot--active' : ''}`} onClick={() => goTo(i)} aria-label={era.name} />
          ))}
        </div>
        <button className="carousel-arrow-sm" onClick={() => goTo(active + 1)} aria-label="Next">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </div>

      {/* Scroll hint — fades out after first interaction */}
      <div className="scroll-hint">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
          <path d="M12 5v14M5 12l7 7 7-7"/>
        </svg>
        <span>Scroll to browse eras</span>
      </div>
    </div>
  );
}

export default EraCarousel;