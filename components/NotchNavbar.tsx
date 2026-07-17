"use client";

// ============================================================
// components/NotchNavbar.tsx
// ============================================================
// Fixed top "notch" navbar — ported from the Vengeance UI notch-navbar
// pattern (https://www.vengenceui.com/components/notch-navbar) into this
// project's actual stack: no Tailwind, no next-themes, no shadcn/lucide.
// Rebuilt with plain CSS + inline styles against the site's real design
// tokens (--black/--gold/--cream, Tanker/Bespoke/Barlow) and real routes.
//
// The site's only nav — BottomNav.tsx was retired (see UI_OVERHAUL_ROADMAP.md
// Phase 1). Renders top on all sizes: full pill on desktop, compact
// single-row with hamburger panel below 900px.
//
// Reads userId / cart count from CartContext (useCartSafe) so it works
// even if ever rendered outside <CartProvider>.
// ============================================================

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useCartSafe } from "@/components/CartContext";

const NAV_LEFT = [
  { label: "BROWSE",     href: "/browse" },
  { label: "MODELS",     href: "/models" },
  { label: "CATEGORIES", href: "/categories" },
];

const NAV_RIGHT = [
  { label: "BRANDS", href: "/brands" },
  { label: "DEALS",  href: "/deals" },
];

const ALL_LINKS = [...NAV_LEFT, ...NAV_RIGHT];

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function GarageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 4l9 6.5" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="20" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18" cy="20" r="1.4" fill="currentColor" stroke="none" />
      <path d="M2.5 3h2l2.2 12.2a2 2 0 0 0 2 1.65h8.1a2 2 0 0 0 2-1.6L21 7.5H6" />
    </svg>
  );
}

const NavLink = ({ href, label, active }: { href: string; label: string; active: boolean }) => (
  <Link href={href} className="notchnav-link" data-active={active || undefined}>
    {label}
  </Link>
);

export default function NotchNavbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { itemCount, userId, setIsOpen: setCartOpen } = useCartSafe();

  // Keep off the DB/admin console
  if (pathname === "/database" || pathname?.startsWith("/admin")) return null;

  const isActive = (href: string) => pathname === href || (href !== "/" && pathname?.startsWith(href));

  return (
    <>
      <header className="notchnav">
        {/* Left rail */}
        <div className="notchnav-rail" />

        <div className="notchnav-pod">
          {/* Left corner notch */}
          <div className="notchnav-corner notchnav-corner--left" aria-hidden="true">
            <svg viewBox="0 0 50 64" preserveAspectRatio="none">
              <path d="M0 0 H50 V64 C25 64 25 40 0 40 Z" fill="var(--black)" />
              <path d="M0 39.5 C25 39.5 25 63.5 50 63.5" fill="none" stroke="var(--gold)" strokeOpacity="0.28" strokeWidth="1" />
            </svg>
          </div>

          {/* Center content */}
          <div className="notchnav-center">
            <div className="notchnav-content">
              <nav className="notchnav-links notchnav-links--left">
                {NAV_LEFT.map((item) => (
                  <NavLink key={item.href} {...item} active={isActive(item.href)} />
                ))}
              </nav>

              <button
                className="notchnav-burger"
                onClick={() => setMobileOpen((v) => !v)}
                aria-label="Toggle menu"
                aria-expanded={mobileOpen}
              >
                <span className={mobileOpen ? "notchnav-burger-x" : "notchnav-burger-lines"}>
                  {mobileOpen ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round"><line x1="4" y1="4" x2="20" y2="20" /><line x1="20" y1="4" x2="4" y2="20" /></svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
                  )}
                </span>
              </button>

              <Link href="/" className="notchnav-logo" aria-label="Stinkin' Supplies home">
                STINKIN&rsquo;
              </Link>

              <nav className="notchnav-links notchnav-links--right">
                {NAV_RIGHT.map((item) => (
                  <NavLink key={item.href} {...item} active={isActive(item.href)} />
                ))}
                <div className="notchnav-utility">
                  <Link href="/search" className="notchnav-icon-btn" aria-label="Search">
                    <SearchIcon />
                  </Link>
                  <Link href="/garage" className="notchnav-icon-btn" aria-label={userId ? "My garage" : "Log in"}>
                    <GarageIcon />
                  </Link>
                  <button className="notchnav-icon-btn notchnav-cart-btn" onClick={() => setCartOpen(true)} aria-label="Cart">
                    <CartIcon />
                    {itemCount > 0 && <span className="notchnav-cart-badge">{itemCount}</span>}
                  </button>
                </div>
              </nav>

              {/* Mobile-only utility cluster */}
              <div className="notchnav-mobile-actions">
                <Link href="/search" className="notchnav-icon-btn" aria-label="Search"><SearchIcon /></Link>
                <button className="notchnav-icon-btn notchnav-cart-btn" onClick={() => setCartOpen(true)} aria-label="Cart">
                  <CartIcon />
                  {itemCount > 0 && <span className="notchnav-cart-badge">{itemCount}</span>}
                </button>
              </div>
            </div>
          </div>

          {/* Right corner notch */}
          <div className="notchnav-corner notchnav-corner--right" aria-hidden="true">
            <svg viewBox="0 0 50 64" preserveAspectRatio="none">
              <path d="M0 0 H50 V40 C25 40 25 64 0 64 Z" fill="var(--black)" />
              <path d="M0 63.5 C25 63.5 25 39.5 50 39.5" fill="none" stroke="var(--gold)" strokeOpacity="0.28" strokeWidth="1" />
            </svg>
          </div>
        </div>

        {/* Right rail */}
        <div className="notchnav-rail" />
      </header>

      {/* Spacer so page content doesn't sit under the fixed header */}
      <div className="notchnav-spacer" />

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.18 }}
            className="notchnav-mobile-panel"
          >
            <nav className="notchnav-mobile-nav">
              {ALL_LINKS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="notchnav-mobile-link"
                  data-active={isActive(item.href) || undefined}
                  onClick={() => setMobileOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
              <div className="notchnav-mobile-divider" />
              <Link href="/garage" className="notchnav-mobile-link" onClick={() => setMobileOpen(false)}>
                {userId ? "MY GARAGE" : "LOG IN"}
              </Link>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .notchnav {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 900;
          height: 64px;
          display: flex;
        }
        .notchnav-rail {
          flex: 1 1 auto;
          min-width: 0;
          height: 40px;
          background: var(--black);
          border-bottom: 1px solid rgba(201,168,76,0.12);
        }
        .notchnav-pod {
          flex: 0 0 auto;
          height: 64px;
          display: flex;
          position: relative;
          margin-left: -1px;
        }
        .notchnav-corner { width: 50px; height: 64px; position: relative; flex-shrink: 0; }
        .notchnav-corner svg { width: 100%; height: 100%; display: block; }
        .notchnav-corner--right { margin-left: -1px; }

        .notchnav-center {
          flex: 0 0 auto;
          height: 64px;
          background: var(--black);
          border-bottom: 1px solid rgba(201,168,76,0.12);
          margin-left: -1px;
        }
        .notchnav-content {
          height: 100%;
          display: flex;
          align-items: center;
          gap: 28px;
          padding: 0 20px;
        }

        .notchnav-links {
          display: flex;
          align-items: center;
          gap: 22px;
        }
        .notchnav-link {
          font-family: var(--font-body), sans-serif;
          font-weight: 600;
          font-size: 12.5px;
          letter-spacing: 0.08em;
          color: var(--chrome, #8a8784);
          text-decoration: none;
          white-space: nowrap;
          transition: color 0.15s ease;
        }
        .notchnav-link:hover { color: var(--cream); }
        .notchnav-link[data-active] { color: var(--gold); }

        .notchnav-logo {
          font-family: var(--font-tanker), serif;
          font-size: 19px;
          letter-spacing: 0.05em;
          color: var(--gold);
          text-decoration: none;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .notchnav-utility {
          display: flex;
          align-items: center;
          gap: 8px;
          padding-left: 16px;
          margin-left: 4px;
          border-left: 1px solid rgba(201,168,76,0.18);
        }
        .notchnav-icon-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          border-radius: 999px;
          background: transparent;
          border: none;
          color: var(--chrome, #8a8784);
          cursor: pointer;
          text-decoration: none;
          position: relative;
          transition: color 0.15s ease, background 0.15s ease;
        }
        .notchnav-icon-btn:hover { color: var(--gold); background: rgba(201,168,76,0.08); }
        .notchnav-cart-badge {
          position: absolute;
          top: 2px;
          right: 2px;
          min-width: 15px;
          height: 15px;
          padding: 0 3px;
          border-radius: 999px;
          background: var(--gold);
          color: var(--black);
          font-family: var(--font-stencil), monospace;
          font-size: 9.5px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
        }

        .notchnav-burger { display: none; background: none; border: none; color: var(--cream); cursor: pointer; padding: 6px; }
        .notchnav-mobile-actions { display: none; align-items: center; gap: 4px; margin-left: auto; }

        .notchnav-spacer { height: 64px; }

        .notchnav-mobile-panel {
          position: fixed;
          top: 64px;
          left: 0;
          right: 0;
          z-index: 899;
          background: var(--black);
          border-bottom: 1px solid rgba(201,168,76,0.18);
          padding: 8px 20px 20px;
        }
        .notchnav-mobile-nav { display: flex; flex-direction: column; }
        .notchnav-mobile-link {
          font-family: var(--font-body), sans-serif;
          font-weight: 600;
          font-size: 15px;
          letter-spacing: 0.06em;
          color: var(--cream);
          text-decoration: none;
          padding: 14px 4px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .notchnav-mobile-link[data-active] { color: var(--gold); }
        .notchnav-mobile-divider { height: 1px; }

        @media (max-width: 900px) {
          .notchnav-links--left, .notchnav-links--right { display: none; }
          .notchnav-utility { border-left: none; padding-left: 0; margin-left: 0; }
          .notchnav-burger { display: flex; }
          .notchnav-mobile-actions { display: flex; }
          .notchnav-content { gap: 12px; padding: 0 14px; }
          .notchnav-corner { display: none; }
          .notchnav-center { flex: 1 1 auto; }
          .notchnav-rail { flex: 0 0 0; }
          .notchnav-logo { margin: 0 auto; }
        }
      `}</style>
    </>
  );
}
