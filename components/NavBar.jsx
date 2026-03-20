"use client";
// ============================================================
// components/NavBar.jsx  —  SHARED NAV
// ============================================================
// Usage:
//   import NavBar from "@/components/NavBar";
//   <NavBar activePage="shop" />
//
// activePage options: "home" | "shop" | "brands" | "garage" |
//                     "search" | "account" | "deals"
//
// Auth state is read from CartContext (useCartSafe) which holds
// the single onAuthStateChange subscription for the whole app.
// NavBar has no Supabase imports or local subscriptions — this
// prevents the stacked-subscription bug that caused every token
// refresh to re-fetch the current server page.
// ============================================================

import { useState } from "react";
import Link from "next/link";
import { useCartSafe } from "@/components/CartContext";

const NAV_LINKS = [
  { label: "Shop",   href: "/shop"            },
  { label: "Brands", href: "/brands"          },
  { label: "Deals",  href: "/shop?badge=sale"  },
  { label: "Search", href: "/search"          },
];

const css = `
  .ss-nav {
    position: sticky; top: 0; z-index: 100;
    background: rgba(10,9,9,0.96);
    border-bottom: 1px solid #2a2828;
    height: 54px;
    display: flex; align-items: center;
    padding: 0 24px; gap: 14px;
    backdrop-filter: blur(10px);
    font-family: 'Barlow Condensed', sans-serif;
  }
  .ss-nav-logo {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 22px; letter-spacing: 0.08em;
    color: #f0ebe3; text-decoration: none; flex: 1;
    white-space: nowrap;
  }
  .ss-nav-logo span { color: #e8621a; }
  .ss-nav-links { display: flex; gap: 20px; margin-right: 8px; }
  .ss-nav-link {
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px; letter-spacing: 0.12em;
    color: #8a8784; text-decoration: none;
    transition: color 0.2s; white-space: nowrap;
  }
  .ss-nav-link:hover { color: #f0ebe3; }
  .ss-nav-link.active { color: #e8621a; }
  .ss-nav-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
  .ss-nav-signin {
    background: transparent;
    border: 1px solid rgba(232,98,26,0.3);
    color: #f0ebe3;
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px; letter-spacing: 0.1em;
    padding: 5px 12px; border-radius: 2px;
    cursor: pointer; transition: all 0.2s;
    text-decoration: none; white-space: nowrap;
  }
  .ss-nav-signin:hover { border-color: #e8621a; color: #e8621a; }
  .ss-nav-garage {
    background: #e8621a; border: none;
    color: #0a0909;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 14px; letter-spacing: 0.1em;
    padding: 5px 14px; border-radius: 2px;
    cursor: pointer; transition: background 0.2s;
    text-decoration: none; white-space: nowrap;
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
    font-family: 'Share Tech Mono', monospace;
    font-size: 7px; width: 14px; height: 14px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    pointer-events: none;
  }
  .ss-mobile-toggle {
    display: none;
    align-items: center; justify-content: center;
    width: 32px; height: 32px;
    background: #1a1919; border: 1px solid #2a2828;
    border-radius: 2px; color: #f0ebe3; cursor: pointer;
  }
  @media (max-width: 700px) {
    .ss-nav-links { display: none; }
    .ss-nav-actions { gap: 6px; }
    .ss-mobile-toggle { display: flex; }
    .ss-nav-garage { display: none; }
  }
  .ss-mobile-menu {
    position: fixed; inset: 54px 0 0;
    background: rgba(10,9,9,0.95);
    display: flex; flex-direction: column;
    padding: 20px 28px; gap: 14px; z-index: 101;
  }
  .ss-mobile-menu a {
    font-family: 'Share Tech Mono', monospace;
    letter-spacing: 0.12em; color: #f0ebe3;
    text-transform: uppercase;
  }
  .ss-mobile-menu a.active { color: #e8621a; }
  .ss-mobile-menu .ss-nav-garage {
    display: inline-flex; align-items: center;
    justify-content: center; width: max-content;
  }
  .ss-mobile-menu-close {
    align-self: flex-end; background: none;
    border: none; color: #8a8784;
    font-size: 20px; cursor: pointer;
  }
`;

export default function NavBar({ activePage = "", cartCount, onCartClick }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // ── Auth + cart state from CartContext ───────────────────
  // CartContext owns the single Supabase auth subscription for
  // the whole app. Reading userId here costs nothing extra.
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
          STINKIN<span>'</span> SUPPLIES
        </Link>

        {/* Desktop links */}
        <div className="ss-nav-links">
          {NAV_LINKS.map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className={`ss-nav-link ${activePage === label.toLowerCase() ? "active" : ""}`}
              onClick={() => setMobileMenuOpen(false)}
            >
              {label.toUpperCase()}
            </Link>
          ))}
        </div>

        <button
          className="ss-mobile-toggle"
          aria-label="Toggle navigation"
          onClick={() => setMobileMenuOpen(v => !v)}
        >
          ☰
        </button>

        {/* Actions */}
        <div className="ss-nav-actions">
          {isSignedIn ? (
            <Link
              href="/account"
              style={{
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: 10, letterSpacing: "0.1em",
                color: "#8a8784", textDecoration: "none",
                padding: "5px 12px", borderRadius: 2,
                border: "1px solid rgba(232,98,26,0.3)",
                transition: "all 0.2s", whiteSpace: "nowrap",
              }}
            >
              ACCOUNT
            </Link>
          ) : (
            <Link href="/auth" className="ss-nav-signin">
              SIGN IN
            </Link>
          )}
          <Link href="/garage" className="ss-nav-garage">MY GARAGE</Link>
          <button className="ss-nav-cart" onClick={handleCartClick} aria-label="Cart">
            🛒
            {displayCount > 0 && (
              <span className="ss-cart-badge">{displayCount}</span>
            )}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="ss-mobile-menu">
          <button
            className="ss-mobile-menu-close"
            onClick={() => setMobileMenuOpen(false)}
          >
            ✕
          </button>
          {NAV_LINKS.map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className={`ss-nav-link ${activePage === label.toLowerCase() ? "active" : ""}`}
              onClick={() => setMobileMenuOpen(false)}
            >
              {label.toUpperCase()}
            </Link>
          ))}
          <Link
            href="/garage"
            className="ss-nav-garage"
            onClick={() => setMobileMenuOpen(false)}
          >
            MY GARAGE
          </Link>
        </div>
      )}
    </>
  );
}