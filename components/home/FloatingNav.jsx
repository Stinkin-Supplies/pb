'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// ─── Floating Nav ─────────────────────────────────────────────────────────────
function FloatingNav() {
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [lastY, setLastY] = useState(0);
  const [manualOpen, setManualOpen] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const fn = () => {
      const y = window.scrollY;
      const scrollingDown = y > lastY;

      // Minimize after 80px scroll down, restore on scroll up
      if (y > 80 && scrollingDown) {
        setMinimized(true);
        setManualOpen(false);
      } else if (y < lastY) {
        setMinimized(false);
        setManualOpen(false);
      }

      setScrolled(y > 40);
      setLastY(y);
    };
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, [lastY]);

  const isOpen = !minimized || manualOpen;

  // Always render both elements — toggle visibility via CSS to avoid hydration mismatch
  const showMini = mounted && minimized && !manualOpen;
  const showFull = !mounted || isOpen;

  return (
    <>
      {/* ── Minimized icon — always in DOM, shown/hidden via opacity */}
      <button
        className="nav-mini"
        style={{
          opacity: showMini ? 1 : 0,
          pointerEvents: showMini ? 'auto' : 'none',
          transform: showMini ? 'scale(1)' : 'scale(0.7)',
        }}
        onClick={() => setManualOpen(true)}
        aria-label="Open navigation"
      >
        <img src="/logo.svg" alt="Stinkin' Supplies" className="nav-mini-logo" />
      </button>

      {/* ── Full pill nav — always in DOM, shown/hidden via opacity */}
      <nav className={`float-nav ${scrolled ? 'scrolled' : ''}`} style={{
        opacity: showFull ? 1 : 0,
        pointerEvents: showFull ? 'auto' : 'none',
        transform: showFull
          ? 'translateX(-50%) translateY(0) scale(1)'
          : 'translateX(-50%) translateY(-12px) scale(0.96)',
      }}>
        <Link href="/" className="nav-logo">
          <img src="/logo.svg" alt="Stinkin' Supplies" style={{ height: '100px', width: 'auto', objectFit: 'contain' }} />
        </Link>
        <div className="nav-links">
          <Link href="/browse">Browse</Link>
          <Link href="/eras">Eras</Link>
          <Link href="/browse?category=all">Categories</Link>
          <Link href="/browse?deals=true">Deals</Link>
          <Link href="/admin/products">Admin</Link>
          <button
            className="nav-close"
            style={{ opacity: manualOpen ? 1 : 0, pointerEvents: manualOpen ? 'auto' : 'none', width: manualOpen ? '30px' : '0' }}
            onClick={() => { setManualOpen(false); setMinimized(true); }}
            aria-label="Close navigation"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </nav>
    </>
  );
}
export default FloatingNav;