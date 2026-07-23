"use client";

/**
 * components/NotchNavbar.tsx
 *
 * Three-panel layout based on user reference:
 *
 *  [BLACK — Logo] | [GOLD BAND — Nav links · Search] | [BLACK — Icons]
 *
 * The gold band reads like a stamped brass identification strip.
 * Nav links in Tanker display font, large, dark text on gold.
 * Dash separators between items, inline search on the right of the band.
 */

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useCartSafe } from "@/components/CartContext";

// ── Nav items ──────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { label: "BROWSE",     href: "/browse"     },
  { label: "MODELS",     href: "/models"     },
  { label: "CATEGORIES", href: "/categories" },
  { label: "BRANDS",     href: "/brands"     },
  { label: "DEALS",      href: "/deals"      },
];

// ── Icons ──────────────────────────────────────────────────────────────────

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7.5" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  );
}

function GarageIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 10.5 12 4l9 6.5" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M9 20v-5h6v5" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9"  cy="20" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="18" cy="20" r="1.2" fill="currentColor" stroke="none" />
      <path d="M2.5 3h2l2.2 12.2a2 2 0 0 0 2 1.65h8.1a2 2 0 0 0 2-1.6L21 7.5H6" />
    </svg>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="4" x2="20" y2="20" /><line x1="20" y1="4" x2="4" y2="20" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <line x1="3" y1="7"  x2="21" y2="7"  />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="17" x2="21" y2="17" />
    </svg>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export default function NotchNavbar() {
  const pathname  = usePathname();
  const router    = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchVal, setSearchVal]   = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const { itemCount, userId, setIsOpen: setCartOpen } = useCartSafe();

  // Suppress on admin / database / design-system routes
  if (
    pathname === "/database" ||
    pathname === "/design-system" ||
    pathname?.startsWith("/admin")
  ) return null;

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname?.startsWith(href));

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchVal.trim();
    if (q) {
      router.push(`/browse?q=${encodeURIComponent(q)}`);
      setSearchVal("");
      searchRef.current?.blur();
    }
  };

  return (
    <>
      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <header className="nav" role="banner">

        {/* ── LEFT — Logo panel (black) ─────────────────────────────────── */}
        <Link href="/" className="nav-logo" aria-label="Stinkin' Supplies home">
          <span className="nav-logo-main">STINKIN&rsquo;</span>
          <span className="nav-logo-sub">SUPPLIES</span>
        </Link>

        {/* ── CENTER — Gold band: nav links + search ────────────────────── */}
        <div className="nav-band">

          {/* Nav links — Tanker, large, dark on gold */}
          <nav className="nav-band-links" aria-label="Main navigation">
            {NAV_ITEMS.map(({ label, href }, i) => (
              <span key={href} className="nav-band-item">
                {i > 0 && <span className="nav-band-dash" aria-hidden="true">—</span>}
                <Link
                  href={href}
                  className="nav-band-link"
                  data-active={isActive(href) || undefined}
                  aria-current={isActive(href) ? "page" : undefined}
                >
                  {label}
                </Link>
              </span>
            ))}
          </nav>

          {/* Inline search — right side of gold band */}
          <form className="nav-search" onSubmit={handleSearch} role="search">
            <input
              ref={searchRef}
              className="nav-search-input"
              type="search"
              value={searchVal}
              onChange={(e) => setSearchVal(e.target.value)}
              placeholder="SEARCH PARTS, OEM#..."
              aria-label="Search parts"
            />
            <button type="submit" className="nav-search-btn" aria-label="Submit search">
              <SearchIcon />
            </button>
          </form>

          {/* Mobile hamburger lives inside the band on small screens */}
          <button
            className="nav-burger"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            aria-controls="nav-mobile-panel"
          >
            <MenuIcon open={mobileOpen} />
          </button>
        </div>

        {/* ── RIGHT — Utility icons (black) ─────────────────────────────── */}
        <div className="nav-utility">
          <Link href="/garage" className="nav-icon-btn" aria-label={userId ? "My garage" : "Sign in"}>
            <GarageIcon />
          </Link>
          <button
            className="nav-icon-btn nav-icon-btn--cart"
            onClick={() => setCartOpen(true)}
            aria-label={`Cart${itemCount > 0 ? `, ${itemCount} item${itemCount !== 1 ? "s" : ""}` : ""}`}
          >
            <CartIcon />
            {itemCount > 0 && (
              <span className="nav-cart-badge" aria-hidden="true">
                {itemCount > 99 ? "99" : itemCount}
              </span>
            )}
          </button>
        </div>

      </header>

      {/* Spacer */}
      <div className="nav-spacer" aria-hidden="true" />

      {/* ── Mobile panel ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            id="nav-mobile-panel"
            role="navigation"
            aria-label="Mobile navigation"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1,  y: 0   }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="nav-mobile-panel"
          >
            {/* Mobile search */}
            <form className="nav-mobile-search" onSubmit={handleSearch} role="search">
              <input
                className="nav-mobile-search-input"
                type="search"
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
                placeholder="SEARCH PARTS, OEM#..."
                aria-label="Search parts"
              />
              <button type="submit" className="nav-mobile-search-btn" aria-label="Submit search">
                <SearchIcon />
              </button>
            </form>

            <p className="section-ident" style={{ padding: "10px 20px 8px", borderBottom: "1px solid var(--steel)" }}>
              NAVIGATION INDEX
            </p>

            <nav className="nav-mobile-links">
              {NAV_ITEMS.map(({ label, href }) => (
                <Link
                  key={href}
                  href={href}
                  className="nav-mobile-link"
                  data-active={isActive(href) || undefined}
                  onClick={() => setMobileOpen(false)}
                >
                  <span className="nav-mobile-link-dash">—</span>
                  {label}
                  {isActive(href) && <span className="nav-mobile-active-dot" aria-hidden="true">◆</span>}
                </Link>
              ))}

              <div style={{ padding: "12px 20px 8px", borderTop: "1px solid var(--steel)" }}>
                <div className="rule-label"><span>ACCOUNT</span></div>
              </div>

              <Link href="/garage" className="nav-mobile-link" onClick={() => setMobileOpen(false)}>
                <span className="nav-mobile-link-dash">—</span>
                {userId ? "MY GARAGE" : "SIGN IN"}
              </Link>
            </nav>

            {itemCount > 0 && (
              <div style={{ padding: "10px 20px", borderTop: "1px solid var(--steel)" }}>
                <span className="stamp stamp-gold">{itemCount} ITEM{itemCount !== 1 ? "S" : ""} IN CART</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Styles ────────────────────────────────────────────────────────── */}
      <style>{`

        /* ── Outer bar ───────────────────────────────────────────────── */
        .nav {
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 900;
          height: 58px;
          display: flex;
          align-items: stretch;
          background: var(--black);
          border-bottom: 2px solid var(--gold-dim);
          /* Outer plate feel — top edge catch of light, depth below */
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.07),
            0 3px 0 0 var(--steel),
            0 4px 28px rgba(0,0,0,0.65);
        }

        /* ── Logo panel — black left section ─────────────────────────── */
        .nav-logo {
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 0 28px;
          text-decoration: none;
          flex-shrink: 0;
          border-right: 2px solid var(--gold-dim);
          gap: 4px;
          min-width: 160px;
        }
        .nav-logo-main {
          font-family: var(--font-tanker), sans-serif;
          font-size: 28px;
          letter-spacing: 0.04em;
          color: var(--cream-light);
          text-transform: uppercase;
          line-height: 1;
          /* Embossed lettering on dark metal — light below, shadow above */
          text-shadow:
            0  1px 0 rgba(255,255,255,0.12),
            0 -1px 0 rgba(0,0,0,0.70),
            0  2px 4px rgba(0,0,0,0.40);
        }
        .nav-logo-sub {
          font-family: var(--font-stencil), monospace;
          font-size: 9px;
          letter-spacing: 0.28em;
          color: var(--gold);
          text-transform: uppercase;
          line-height: 1;
          text-shadow: 0 1px 2px rgba(0,0,0,0.60);
        }

        /* ── Gold band — center section ──────────────────────────────── */
        .nav-band {
          flex: 1 1 auto;
          display: flex;
          align-items: center;
          background: var(--gold);
          padding: 0 16px 0 20px;
          gap: 16px;
          min-width: 0;
          overflow: hidden;
          /* Raised brass plate — highlight on top, shadow on bottom,
             subtle gradient darkens toward bottom edge               */
          background-image: linear-gradient(
            to bottom,
            rgba(255,255,255,0.18) 0%,
            rgba(255,255,255,0.04) 40%,
            rgba(0,0,0,0.08)       100%
          );
          box-shadow:
            inset 0  1px 0 rgba(255,255,255,0.35),
            inset 0 -1px 0 rgba(0,0,0,0.30),
            inset 1px 0 0 rgba(255,255,255,0.20),
            inset -1px 0 0 rgba(0,0,0,0.18);
        }

        /* Nav links row */
        .nav-band-links {
          display: flex;
          align-items: center;
          flex-shrink: 0;
          gap: 0;
        }
        .nav-band-item {
          display: flex;
          align-items: center;
        }
        .nav-band-dash {
          font-family: var(--font-tanker), sans-serif;
          font-size: 18px;
          color: var(--gold-dim);
          margin: 0 10px;
          line-height: 1;
          opacity: 0.6;
          user-select: none;
        }
        .nav-band-link {
          font-family: var(--font-tanker), sans-serif;
          font-size: 20px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--black);
          text-decoration: none;
          line-height: 1;
          transition: opacity 0.12s ease;
          white-space: nowrap;
          padding-bottom: 2px;
          border-bottom: 2px solid transparent;
          /* Debossed stamp on brass — letters pressed into the plate */
          text-shadow:
            0  1px 0 rgba(255,255,255,0.30),
            0 -1px 0 rgba(0,0,0,0.22),
            0  1px 3px rgba(0,0,0,0.12);
        }
        .nav-band-link:hover {
          opacity: 0.65;
        }
        .nav-band-link[data-active] {
          border-bottom-color: var(--black);
          opacity: 1;
        }

        /* Inline search — right of gold band */
        .nav-search {
          display: flex;
          align-items: center;
          margin-left: auto;
          flex-shrink: 0;
          border: 1.5px solid rgba(0,0,0,0.25);
        }
        .nav-search-input {
          background: rgba(255,255,255,0.82);
          border: none;
          outline: none;
          height: 30px;
          padding: 0 10px;
          font-family: var(--font-stencil), monospace;
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--black);
          width: 180px;
          /* Remove default search cancel button */
          -webkit-appearance: none;
          appearance: none;
        }
        .nav-search-input::placeholder {
          color: rgba(0,0,0,0.40);
          font-family: var(--font-stencil), monospace;
          font-size: 10px;
          letter-spacing: 0.10em;
        }
        .nav-search-input::-webkit-search-cancel-button { display: none; }
        .nav-search-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          background: rgba(0,0,0,0.18);
          border: none;
          color: var(--black);
          cursor: pointer;
          flex-shrink: 0;
          transition: background 0.12s ease;
        }
        .nav-search-btn:hover { background: rgba(0,0,0,0.30); }

        /* Hamburger — hidden on desktop, shown inside band on mobile */
        .nav-burger {
          display: none;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          background: rgba(0,0,0,0.15);
          border: none;
          color: var(--black);
          cursor: pointer;
          flex-shrink: 0;
          margin-left: auto;
          transition: background 0.12s ease;
        }
        .nav-burger:hover { background: rgba(0,0,0,0.28); }

        /* ── Utility panel — black right section ─────────────────────── */
        .nav-utility {
          display: flex;
          align-items: center;
          padding: 0 12px;
          gap: 4px;
          flex-shrink: 0;
          border-left: 2px solid var(--gold-dim);
        }
        .nav-icon-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          background: transparent;
          border: none;
          color: var(--chrome);
          cursor: pointer;
          text-decoration: none;
          position: relative;
          transition: color 0.12s ease, background 0.12s ease;
        }
        .nav-icon-btn:hover {
          color: var(--gold);
          background: var(--gold-muted);
        }
        .nav-cart-badge {
          position: absolute;
          top: 3px; right: 3px;
          min-width: 14px; height: 14px;
          padding: 0 2px;
          background: var(--gold);
          color: var(--black);
          font-family: var(--font-stencil), monospace;
          font-size: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
        }

        /* ── Spacer ──────────────────────────────────────────────────── */
        .nav-spacer { height: 60px; }

        /* ── Mobile panel ────────────────────────────────────────────── */
        .nav-mobile-panel {
          position: fixed;
          top: 60px; left: 0; right: 0;
          z-index: 899;
          background: var(--coal);
          background-image:
            linear-gradient(rgba(61,90,122,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(61,90,122,0.06) 1px, transparent 1px);
          background-size: 32px 32px;
          border-bottom: 1px solid var(--gold-rule);
          box-shadow: 0 2px 0 0 var(--steel), 0 8px 32px rgba(0,0,0,0.6);
        }
        .nav-mobile-search {
          display: flex;
          align-items: center;
          margin: 12px 16px;
          border: 1px solid var(--steel2);
        }
        .nav-mobile-search-input {
          flex: 1;
          background: var(--iron);
          border: none;
          outline: none;
          height: 36px;
          padding: 0 12px;
          font-family: var(--font-stencil), monospace;
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--cream);
        }
        .nav-mobile-search-input::placeholder {
          color: var(--fog);
          font-size: 9px;
        }
        .nav-mobile-search-input::-webkit-search-cancel-button { display: none; }
        .nav-mobile-search-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px; height: 36px;
          background: var(--gold-muted);
          border: none;
          color: var(--gold);
          cursor: pointer;
        }
        .nav-mobile-links {
          display: flex;
          flex-direction: column;
        }
        .nav-mobile-link {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 13px 20px;
          border-bottom: 1px solid var(--steel);
          font-family: var(--font-stencil), monospace;
          font-size: 11px;
          letter-spacing: var(--tracking-stamp);
          text-transform: uppercase;
          color: var(--silver);
          text-decoration: none;
          transition: color 0.12s, background 0.12s;
        }
        .nav-mobile-link:hover { color: var(--cream); background: rgba(255,255,255,0.03); }
        .nav-mobile-link[data-active] { color: var(--gold); }
        .nav-mobile-link-dash { color: var(--steel2); font-size: 10px; }
        .nav-mobile-active-dot { margin-left: auto; color: var(--gold); font-size: 7px; }

        /* ── Responsive ──────────────────────────────────────────────── */
        @media (max-width: 960px) {
          .nav-band-links { display: none; }
          .nav-search      { display: none; }
          .nav-burger      { display: flex; }
          .nav-band        { padding: 0 12px; }
        }

        @media (max-width: 480px) {
          .nav-logo        { padding: 0 14px; min-width: 100px; }
          .nav-logo-main   { font-size: 17px; }
          .nav-utility     { padding: 0 8px; }
        }
      `}</style>
    </>
  );
}
