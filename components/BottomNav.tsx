"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const SEARCH_OPTIONS = [
  { label: "ERA",    href: "/era"       },
  { label: "MODEL",  href: "/modelshop" },
  { label: "SEARCH", href: "/search"    },
];

export default function BottomNav() {
  const pathname = usePathname();
  const router   = useRouter();
  const [open, setOpen] = useState(false);

  const onBrowse = pathname === "/browse" || pathname.startsWith("/browse/");

  // On /browse the left slot is a filter toggle — fires window event
  // so the browse page's FilterSidebar picks it up without prop drilling
  const handleFilterToggle = () => {
    window.dispatchEvent(new CustomEvent("stinkin:filterToggle"));
  };

  return (
    <>
      <div style={{ height: 0 }} />

      {/* Search popup — not shown when on browse (hamburger is filter there) */}
      <AnimatePresence>
        {open && !onBrowse && (
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
              animate={{ y: 0,   opacity: 1 }}
              exit={{ y: 100,    opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 36 }}
              style={{
                position: "fixed",
                bottom: 78,
                left: "50%",
                transform: "translateX(-50%)",
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
                    padding: "0", width: "100%", textAlign: "center",
                  }}
                >
                  {opt.label}
                </motion.button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <nav style={{
        position: "fixed",
        bottom: 14,
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(88vw, 440px)",
        zIndex: 1000,
        background: "#080706",
        borderRadius: 999,
        border: "1px solid #2a2826",
        boxShadow: "0 6px 32px rgba(0,0,0,0.9)",
        height: 58,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
      }}>

        {/* Left slot */}
        {onBrowse ? (
          // On /browse: filter toggle button (mobile only — hidden on desktop via CSS)
          <button
            onClick={handleFilterToggle}
            className="browse-filter-btn"
            aria-label="Open filters"
            style={{
              background: "none", border: "none", cursor: "pointer",
              display: "flex", flexDirection: "column", gap: 5,
              padding: "6px 2px", alignItems: "flex-start",
            }}
          >
            <span style={{ display: "block", width: 22, height: 2, background: "#666", borderRadius: 1 }} />
            <span style={{ display: "block", width: 14, height: 2, background: "#666", borderRadius: 1 }} />
            <span style={{ display: "block", width: 22, height: 2, background: "#666", borderRadius: 1 }} />
          </button>
        ) : (
          <a href="/" style={{ textDecoration: "none" }}>
            <span style={{
              fontFamily: "var(--font-sailor, serif)", fontSize: 22, fontWeight: 700,
              letterSpacing: "0.07em", color: pathname === "/" ? "#c9a84c" : "#666",
              transition: "color 0.15s",
            }}>HOME</span>
          </a>
        )}

        {/* Center: search orb */}
        <button
          onClick={() => !onBrowse && setOpen(p => !p)}
          style={{
            width: 50, height: 50, borderRadius: "50%", marginTop: -20,
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
        <a href="/garage" style={{ textDecoration: "none" }}>
          <span style={{
            fontFamily: "var(--font-sailor, serif)", fontSize: 22, fontWeight: 700,
            letterSpacing: "0.07em",
            color: pathname.startsWith("/garage") ? "#c9a84c" : "#666",
            transition: "color 0.15s",
          }}>GARAGE</span>
        </a>

      </nav>

      <style>{`
        /* On desktop ≥769px, hide the hamburger in the bottom nav on browse
           (desktop has the persistent sidebar) */
        @media (min-width: 769px) {
          .browse-filter-btn { display: none !important; }
        }
      `}</style>
    </>
  );
}
