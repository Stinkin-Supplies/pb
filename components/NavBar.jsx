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

import { useEffect, useState } from "react";
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
  }
  .ss-nav-logo {
    color: #f0ebe3; text-decoration: none; flex: none;
    white-space: nowrap; max-width: none;
    height: 23px;
    display: flex; align-items: center;
  }
  .ss-nav-logo span {
    color: #e8621a;
    height: 100%;
    font-size: 25px;
  }
  .ss-nav-links { display: flex; gap: 20px; margin-right: 8px; }
  .ss-nav-link {
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
    padding: 5px 12px; border-radius: 2px;
    cursor: pointer; transition: all 0.2s;
    text-decoration: none; white-space: nowrap;
  }
  .ss-nav-signin:hover { border-color: #e8621a; color: #e8621a; }
  .ss-nav-garage {
    background: #e8621a; border: none;
    color: #0a0909;
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
    position: absolute;
    top: 100%;
    left: 5%;
    right: 5%;
    width: 90%;
    background: #111010;
    border: 1px solid #2a2828;
    display: flex; flex-direction: column;
    z-index: 101;
    border-radius: 2px;
    overflow: hidden;
  }
  .ss-mobile-nav-item {
    position: relative;
    width: 100%;
    height: 114px;
    display: flex;
    align-items: center;
    text-align: center;
    justify-content: center;
    border-bottom: 2px solid #171717;
    overflow: visible;
    text-decoration: none;
    background: #090909;
  }
  .ss-spray-canvas {
    position: absolute;
    inset: -20px;
    width: calc(100% + 40px);
    height: calc(100% + 40px);
    pointer-events: none;
    z-index: 0;
  }
  .ss-nav-label {
    position: relative;
    z-index: 1;
    font-family: var(--font-stencil);
    font-size: 42px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: #f7d55b;
    text-shadow:
      0 0 10px rgba(247,213,91,0.24),
      0 0 18px rgba(247,213,91,0.14);
  }
  .ss-mobile-nav-item.active .ss-nav-label {
    font-size: 58px;
    color: #f7d55b;
  }
  .ss-mobile-nav-item:not(.active) .ss-nav-label {
    color: rgba(247,213,91,0.78);
  }
  .ss-mobile-nav-item:hover .ss-nav-label {
    color: #f7d55b;
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

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const timer = setTimeout(() => {
      document.querySelectorAll(".ss-spray-canvas").forEach(canvas => {
        const isActive = canvas.dataset.active === "true";
        const parent = canvas.parentElement;
        if (!parent) return;

        const w = canvas.offsetWidth;
        const h = canvas.offsetHeight;
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.clearRect(0, 0, w, h);

        // number of spray dots
        const dots = isActive ? 2200 : 900;
        const cx = w / 2;
        const cy = h / 2;
        const spreadX = w * 0.52;
        const spreadY = h * 0.52;
        const color = "247,213,91";

        for (let i = 0; i < dots; i++) {
          // gaussian-ish spread — more dots near center, bleeding out
          const angle = Math.random() * Math.PI * 2;
          const r = Math.pow(Math.random(), 0.4); // bias toward edges for bleed
          const x = cx + Math.cos(angle) * r * spreadX * (0.6 + Math.random() * 0.8);
          const y = cy + Math.sin(angle) * r * spreadY * (0.6 + Math.random() * 0.8);
          const size = Math.random() * (isActive ? 2.2 : 1.4);
          const alpha = Math.random() * (isActive ? 0.55 : 0.25);

          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${color}, ${alpha})`;
          ctx.fill();
        }

        // After drawing the dots, add the stencil border
        const borderInset = 12;
        const roughness = 3;
        const borderColor = "247,213,91";
        const borderAlpha = isActive ? 0.6 : 0.2;

        // draw rough rectangle border
        ctx.strokeStyle = `rgba(${borderColor}, ${borderAlpha})`;
        ctx.lineWidth = isActive ? 5 : 3;
        ctx.setLineDash([]);

        // rough path instead of perfect rect
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const corners = [
            [borderInset, borderInset],
            [w - borderInset, borderInset],
            [w - borderInset, h - borderInset],
            [borderInset, h - borderInset],
          ];
          const [x, y] = corners[i];
          const jitter = () => (Math.random() - 0.5) * roughness;
          if (i === 0) ctx.moveTo(x + jitter(), y + jitter());
          else ctx.lineTo(x + jitter(), y + jitter());
        }
        ctx.closePath();
        ctx.stroke();

        // add paint drips on active
        if (isActive) {
          const numDrips = 6 + Math.floor(Math.random() * 5);
          for (let d = 0; d < numDrips; d++) {
            const drip_x = borderInset + Math.random() * (w - borderInset * 2);
            const drip_len = 15 + Math.random() * 35;
            const drip_w = 1.5 + Math.random() * 3;
            const startY = isActive ? h - borderInset : borderInset;

            ctx.beginPath();
            ctx.moveTo(drip_x, startY);
            ctx.bezierCurveTo(
              drip_x + (Math.random() - 0.5) * 4, startY + drip_len * 0.3,
              drip_x + (Math.random() - 0.5) * 4, startY + drip_len * 0.7,
              drip_x + (Math.random() - 0.5) * 3, startY + drip_len
            );
            ctx.strokeStyle = `rgba(${borderColor}, ${0.3 + Math.random() * 0.4})`;
            ctx.lineWidth = drip_w;
            ctx.stroke();

            // drip tip
            ctx.beginPath();
            ctx.arc(drip_x + (Math.random() - 0.5) * 3, startY + drip_len, drip_w * 0.8, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${borderColor}, 0.4)`;
            ctx.fill();
          }
        }
      });
    }, 50);

    return () => clearTimeout(timer);
  }, [mobileMenuOpen, activePage]);

  return (
    <>
      <style>{css}</style>
      <nav className="ss-nav">

        {/* Logo */}
        <Link href="/" className="ss-nav-logo">
          <span
            className="font-caesar tracking-wider text-orange-500 whitespace-nowrap max-w-none"
            style={{ fontFamily: "var(--font-caesar)" }}
          >
            STINKIN&apos; SUPPLIES
          </span>
        </Link>

        {/* Desktop links */}
        <div className="ss-nav-links">
          {NAV_LINKS.map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className={`ss-nav-link text-xs tracking-widest uppercase ${activePage === label.toLowerCase() ? "active" : ""}`}
              style={{ fontFamily: "var(--font-stencil)" }}
              onClick={() => setMobileMenuOpen(false)}
            >
              {label}
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
              className="text-xs tracking-widest uppercase ss-nav-signin"
              style={{ fontFamily: "var(--font-stencil)" }}
            >
              Account
            </Link>
          ) : (
            <Link href="/auth" className="ss-nav-signin">
              SIGN IN
            </Link>
          )}
          <Link
            href="/garage"
            className="ss-nav-garage text-lg bg-orange-500 text-white px-5 py-2 whitespace-nowrap"
            style={{ fontFamily: "var(--font-caesar)" }}
          >
            My Garage
          </Link>
          <button className="ss-nav-cart" onClick={handleCartClick} aria-label="Cart">
            🛒
            {displayCount > 0 && (
              <span className="ss-cart-badge">{displayCount}</span>
            )}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="ss-mobile-menu">
            {NAV_LINKS.map(({ label, href }) => (
              <Link
                key={label}
                href={href}
                data-label={label}
                className={`ss-mobile-nav-item ${activePage === label.toLowerCase() ? "active" : ""}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                <canvas
                  className="ss-spray-canvas"
                  data-text={label}
                  data-active={activePage === label.toLowerCase()}
                />
                <span className="ss-nav-label">{label}</span>
              </Link>
            ))}
            <Link
              href="/account"
              data-label="Account"
              className={`ss-mobile-nav-item ${activePage === "account" ? "active" : ""}`}
              onClick={() => setMobileMenuOpen(false)}
            >
              <canvas
                className="ss-spray-canvas"
                data-text="Account"
                data-active={activePage === "account"}
              />
              <span className="ss-nav-label">Account</span>
            </Link>
            <Link
              href="/garage"
              data-label="My Garage"
              className={`ss-mobile-nav-item ${activePage === "garage" ? "active" : ""}`}
              onClick={() => setMobileMenuOpen(false)}
            >
              <canvas
                className="ss-spray-canvas"
                data-text="My Garage"
                data-active={activePage === "garage"}
              />
              <span className="ss-nav-label">My Garage</span>
            </Link>
          </div>
        )}
      </nav>
    </>
  );
}
