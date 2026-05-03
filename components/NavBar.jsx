"use client";
// ============================================================
// components/NavBar.jsx  —  SHARED NAV
// Updated: GlobalSearch wired in (desktop + mobile)
// ============================================================

import { useState } from "react";
import Link from "next/link";
import { useCartSafe } from "@/components/CartContext";
import GlobalSearch from "@/components/GlobalSearch";

const NAV_LINKS = [
  { label: "Shop",   href: "/shop"            },
  { label: "Brands", href: "/brands"          },
  { label: "Deals",  href: "/shop?badge=sale"  },
];

const css = `
  .ss-nav {
    position: sticky; top: 0; z-index: 100;
    background: rgba(10,9,9,0.96);
    border-bottom: 1px solid #2a2828;
    height: 54px;
    display: flex; align-items: center;
    padding: 0 20px; gap: 12px;
    backdrop-filter: blur(10px);
  }

  /* Logo */
  .ss-nav-logo {
    color: #f0ebe3; text-decoration: none; flex: none;
    white-space: nowrap;
    height: 23px;
    display: flex; align-items: center;
  }
  .ss-nav-logo span {
    color: #e8621a;
    font-size: 22px;
  }

  /* Desktop links — left of search */
  .ss-nav-links {
    display: flex; gap: 18px; flex: none;
  }
  .ss-nav-link {
    color: #8a8784; text-decoration: none;
    font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
    font-family: var(--font-stencil);
    transition: color 0.2s; white-space: nowrap;
  }
  .ss-nav-link:hover { color: #f0ebe3; }
  .ss-nav-link.active { color: #e8621a; }

  /* Search — grows to fill middle */
  .ss-nav-search {
    flex: 1;
    min-width: 0;
    max-width: 480px;
  }

  /* Right actions */
  .ss-nav-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .ss-nav-signin {
    background: transparent;
    border: 1px solid rgba(232,98,26,0.3);
    color: #f0ebe3;
    font-family: var(--font-stencil);
    font-size: 10px; letter-spacing: 0.12em;
    padding: 5px 11px; border-radius: 2px;
    cursor: pointer; transition: all 0.2s;
    text-decoration: none; white-space: nowrap;
  }
  .ss-nav-signin:hover { border-color: #e8621a; color: #e8621a; }
  .ss-nav-garage {
    background: #e8621a; border: none;
    color: #0a0909;
    font-family: var(--font-caesar);
    font-size: 14px; letter-spacing: 0.06em;
    padding: 5px 13px; border-radius: 2px;
    cursor: pointer; transition: background 0.2s;
    text-decoration: none; white-space: nowrap;
    display: inline-flex; align-items: center;
  }
  .ss-nav-garage:hover { background: #c94f0f; }
  .ss-nav-cart {
    position: relative; cursor: pointer;
    font-size: 18px; background: none;
    border: none; color: #f0ebe3; padding: 0;
    transition: color 0.2s; flex-shrink: 0;
  }
  .ss-nav-cart:hover { color: #e8621a; }
  .ss-cart-badge {
    position: absolute; top: -5px; right: -7px;
    background: #e8621a; color: #0a0909;
    font-size: 7px; width: 14px; height: 14px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    pointer-events: none;
  }

  /* Mobile toggle */
  .ss-mobile-toggle {
    display: none;
    align-items: center; justify-content: center;
    width: 32px; height: 32px;
    background: #1a1919; border: 1px solid #2a2828;
    border-radius: 2px; color: #f0ebe3; cursor: pointer;
    flex-shrink: 0;
  }

  /* Mobile: hide links + garage, show toggle */
  @media (max-width: 768px) {
    .ss-nav-links   { display: none; }
    .ss-nav-search  { display: none; }
    .ss-nav-garage  { display: none; }
    .ss-nav-signin  { display: none; }
    .ss-mobile-toggle { display: flex; }
  }

  /* Mobile menu overlay */
  .ss-mobile-menu {
    position: fixed; inset: 54px 0 0;
    background: #111010;
    display: flex; flex-direction: column;
    padding: 20px 24px; gap: 0;
    z-index: 101; overflow-y: auto;
  }
  .ss-mobile-search {
    margin-bottom: 20px;
  }
  .ss-mobile-menu-link {
    color: #8a8784; text-decoration: none;
    font-family: var(--font-stencil);
    font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase;
    padding: 14px 0;
    border-bottom: 1px solid #1a1919;
    display: block;
    transition: color 0.15s;
  }
  .ss-mobile-menu-link:hover,
  .ss-mobile-menu-link.active { color: #e8621a; }
  .ss-mobile-menu-close {
    align-self: flex-end; background: none;
    border: none; color: #8a8784;
    font-size: 20px; cursor: pointer;
    margin-bottom: 12px; padding: 0;
  }
  .ss-mobile-garage {
    margin-top: 20px;
    display: inline-flex; align-items: center; justify-content: center;
    background: #e8621a; border: none; color: #0a0909;
    font-family: var(--font-caesar); font-size: 16px; letter-spacing: 0.06em;
    padding: 10px 20px; border-radius: 2px; width: 100%;
    text-decoration: none; cursor: pointer;
  }
`;

export default function NavBar({ activePage = "", cartCount, onCartClick }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { itemCount, setIsOpen, userId } = useCartSafe();

  const displayCount = cartCount ?? itemCount;
  const isSignedIn   = Boolean(userId);

  const handleCartClick = () => {
    if (onCartClick) { onCartClick(); return; }
    setIsOpen(true);
  };

  return (
    <>
      <style>{css}</style>
      <nav className="ss-nav">

        {/* Logo */}
        <Link href="/" className="ss-nav-logo">
          <span style={{ fontFamily: "var(--font-caesar)" }}>
            STINKIN&apos; SUPPLIES
          </span>
        </Link>

        {/* Desktop nav links */}
        <div className="ss-nav-links">
          {NAV_LINKS.map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className={`ss-nav-link ${activePage === label.toLowerCase() ? "active" : ""}`}
              onClick={() => setMobileMenuOpen(false)}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* ── GLOBAL SEARCH (desktop) ── */}
        <GlobalSearch className="ss-nav-search" />

        {/* Mobile toggle */}
        <button
          className="ss-mobile-toggle"
          aria-label="Toggle navigation"
          onClick={() => setMobileMenuOpen(v => !v)}
        >
          {mobileMenuOpen ? "✕" : "☰"}
        </button>

        {/* Right actions (desktop) */}
        <div className="ss-nav-actions">
          {isSignedIn ? (
            <Link href="/account" className="ss-nav-signin">ACCOUNT</Link>
          ) : (
            <Link href="/auth" className="ss-nav-signin">SIGN IN</Link>
          )}
          <Link href="/garage" className="ss-nav-garage">
            My Garage
          </Link>
          <button className="ss-nav-cart" onClick={handleCartClick} aria-label="Cart">
            🛒
            {displayCount > 0 && (
              <span className="ss-cart-badge">{displayCount}</span>
            )}
          </button>
        </div>

      </nav>

      {/* ── MOBILE MENU ── */}
      {mobileMenuOpen && (
        <div className="ss-mobile-menu">
          <button
            className="ss-mobile-menu-close"
            onClick={() => setMobileMenuOpen(false)}
          >
            ✕
          </button>

          {/* Search in mobile menu */}
          <div className="ss-mobile-search">
            <GlobalSearch placeholder="Search parts..." />
          </div>

          {/* Nav links */}
          {[...NAV_LINKS, { label: "Search", href: "/search" }].map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className={`ss-mobile-menu-link ${activePage === label.toLowerCase() ? "active" : ""}`}
              onClick={() => setMobileMenuOpen(false)}
            >
              {label}
            </Link>
          ))}

          {isSignedIn ? (
            <Link href="/account" className="ss-mobile-menu-link" onClick={() => setMobileMenuOpen(false)}>
              Account
            </Link>
          ) : (
            <Link href="/auth" className="ss-mobile-menu-link" onClick={() => setMobileMenuOpen(false)}>
              Sign In
            </Link>
          )}

          <Link href="/garage" className="ss-mobile-garage" onClick={() => setMobileMenuOpen(false)}>
            My Garage
          </Link>
        </div>
      )}
    </>
  );
}