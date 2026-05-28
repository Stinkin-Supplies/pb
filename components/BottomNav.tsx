"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const SEARCH_OPTIONS = [
  { label: "ERA",    href: "/era"       },
  { label: "MODEL",  href: "/modelshop" },
  { label: "SEARCH", href: "/search"    },
];

const THRESHOLD  = 40;
const SETTLE_MS  = 1200;

function useScrollCollapse() {
  const [collapsed, setCollapsed]   = useState(false);
  const lastY      = useRef(0);
  const ticking    = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Don't run on server
    lastY.current = window.scrollY;

    function onScroll() {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const y  = window.scrollY;
        const dy = y - lastY.current;
        lastY.current  = y;
        ticking.current = false;

        if (settleTimer.current) clearTimeout(settleTimer.current);

        if (dy > 0 && y > THRESHOLD) {
          setCollapsed(true);
          settleTimer.current = setTimeout(() => setCollapsed(false), SETTLE_MS);
        } else if (dy < 0) {
          setCollapsed(false);
        }
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, []);

  return collapsed;
}

export default function BottomNav() {
  const pathname  = usePathname();
  const router    = useRouter();
  const [open, setOpen] = useState(false);
  const collapsed = useScrollCollapse();

  const hideOnRoute = pathname === "/database" || pathname === "/admin/database";
  const onBrowse = pathname === "/browse" || pathname.startsWith("/browse/");
  const isOpen = open && !collapsed;

  const handleFilterToggle = () => {
    window.dispatchEvent(new CustomEvent("stinkin:filterToggle"));
  };

  if (hideOnRoute) return null;

  // ── Shared search popup (position shifts with collapsed state) ────────────
  const searchPopup = (
    <AnimatePresence>
      {isOpen && !onBrowse && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 998, background: "rgba(0,0,0,0.6)" }}
          />
          <motion.div
            key="panel"
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 36 }}
            style={{
              position: "fixed",
              bottom: 84,
              ...(collapsed ? { right: 14 } : { left: "50%", transform: "translateX(-50%)" }),
              zIndex: 999,
              background: "#c9a84c",
              borderRadius: 14,
              padding: "12px 40px 16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
            }}
          >
            {SEARCH_OPTIONS.map((opt, i) => (
              <motion.button
                key={opt.label}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => { setOpen(false); router.push(opt.href); }}
                style={{
                  background: "transparent", border: "none", cursor: "pointer",
                  fontFamily: "var(--font-sailor, serif)", fontSize: 30,
                  fontWeight: 700, letterSpacing: "0.06em",
                  color: "#080706", lineHeight: 1.35,
                  padding: 0, width: "100%", textAlign: "center",
                }}
              >
                {opt.label}
              </motion.button>
            ))}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  // ── Single nav element that morphs between pill ↔ orb ────────────────────
  // We never unmount this — only animate its layout properties.
  return (
    <>
      <div style={{ height: 0 }} />
      {searchPopup}

      <motion.nav
        layout
        animate={collapsed ? "collapsed" : "expanded"}
        variants={{
          expanded: {
            bottom: 14,
            right: "auto",
            left: "50%",
            x: "-50%",
            width: "min(88vw, 440px)",
            height: 58,
            borderRadius: 999,
            paddingLeft: 24,
            paddingRight: 24,
          },
          collapsed: {
            bottom: 20,
            right: 20,
            left: "auto",
            x: "0%",
            width: 52,
            height: 52,
            borderRadius: 999,
            paddingLeft: 0,
            paddingRight: 0,
          },
        }}
        transition={{ type: "spring", stiffness: 380, damping: 36 }}
        style={{
          position: "fixed",
          zIndex: 1000,
          background: "#080706",
          border: "1px solid #2a2826",
          boxShadow: "0 6px 32px rgba(0,0,0,0.9)",
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          // layout="position" would fight with the left/right swap — use
          // willChange to keep compositing smooth
          clipPath: collapsed ? "none" : "none",
          willChange: "transform, width, height",
        }}
      >
        {/* ── Collapsed: single orb button ── */}
        <AnimatePresence mode="wait" initial={false}>
          {collapsed ? (
            <motion.button
              key="orb-collapsed"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ duration: 0.15 }}
              onClick={() => {
                if (onBrowse) handleFilterToggle();
                else setOpen(p => !p);
              }}
              aria-label="Navigation"
              style={{
                width: 52, height: 52, borderRadius: "50%",
                background: "radial-gradient(circle at 35% 30%, #f0d060, #c9a84c 55%, #7a5510)",
                border: "none",
                outline: "1.5px solid rgba(201,168,76,0.45)",
                outlineOffset: 2,
                boxShadow: "inset 0 1px 0 rgba(255,235,120,0.5)",
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#3a2800",
                padding: 0,
                flexShrink: 0,
              }}
            >
              {onBrowse ? (
                <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
                  <rect x="0" y="0"  width="18" height="2" rx="1" fill="currentColor"/>
                  <rect x="2" y="6"  width="14" height="2" rx="1" fill="currentColor"/>
                  <rect x="0" y="12" width="18" height="2" rx="1" fill="currentColor"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              )}
            </motion.button>
          ) : (
            /* ── Expanded: full pill contents ── */
            <motion.div
              key="pill-expanded"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{
                display: "flex", alignItems: "center",
                justifyContent: "space-between",
                width: "100%", height: "100%",
              }}
            >
              {/* Left slot */}
              <div style={{ position: "relative", minWidth: 48 }}>
                <Link
                  href="/"
                  className={onBrowse ? "left-home left-home--browse" : "left-home"}
                  style={{ textDecoration: "none" }}
                >
                  <span style={{
                    fontFamily: "var(--font-sailor, serif)", fontSize: 22, fontWeight: 700,
                    letterSpacing: "0.07em",
                    color: pathname === "/" ? "#c9a84c" : "#666",
                    transition: "color 0.15s",
                  }}>HOME</span>
                </Link>

                {onBrowse && (
                  <button
                    onClick={handleFilterToggle}
                    className="browse-filter-btn"
                    aria-label="Open filters"
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      display: "flex", flexDirection: "column", gap: 5,
                      padding: "6px 2px", alignItems: "flex-start",
                      position: "absolute", top: "50%", left: 0,
                      transform: "translateY(-50%)",
                    }}
                  >
                    <span style={{ display: "block", width: 22, height: 2, background: "#aaa", borderRadius: 1 }} />
                    <span style={{ display: "block", width: 14, height: 2, background: "#aaa", borderRadius: 1 }} />
                    <span style={{ display: "block", width: 22, height: 2, background: "#aaa", borderRadius: 1 }} />
                  </button>
                )}
              </div>

              {/* Center orb */}
              <button
                onClick={() => !onBrowse && setOpen(p => !p)}
                style={{
                  width: 50, height: 50, borderRadius: "50%",
                  flexShrink: 0,
                  background: "radial-gradient(circle at 35% 30%, #f0d060, #c9a84c 55%, #7a5510)",
                  border: "2px solid #080706",
                  outline: "1.5px solid rgba(201,168,76,0.35)",
                  outlineOffset: 2,
                  boxShadow: open
                    ? "0 2px 18px rgba(201,168,76,0.65)"
                    : "0 4px 14px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,235,120,0.5)",
                  transform: open ? "translateY(-2px) rotate(10deg)" : "none",
                  transition: "all 0.2s cubic-bezier(0.34,1.56,0.64,1)",
                  cursor: onBrowse ? "default" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#3a2800",
                  opacity: onBrowse ? 0.7 : 1,
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </button>

              {/* Right: GARAGE */}
              <Link href="/garage" style={{ textDecoration: "none" }}>
                <span style={{
                  fontFamily: "var(--font-sailor, serif)", fontSize: 22, fontWeight: 700,
                  letterSpacing: "0.07em",
                  color: pathname.startsWith("/garage") ? "#c9a84c" : "#666",
                  transition: "color 0.15s",
                }}>GARAGE</span>
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>

      <style>{`
        @media (min-width: 769px) {
          .browse-filter-btn { display: none !important; }
          .left-home--browse { display: inline !important; }
        }
        @media (max-width: 768px) {
          .left-home--browse { display: none !important; }
          .browse-filter-btn { display: flex !important; }
        }
      `}</style>
    </>
  );
}
