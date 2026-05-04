"use client";
// ============================================================
// components/SideNav.jsx
// Logo image trigger → right slide-in nav panel
//
// 1. Copy logo.png to public/images/logo.png
// 2. Import and use in FloatingHeader:
//
//    import SideNav from "@/components/SideNav";
//
//    Replace the existing logo Link + right actions with:
//    <SideNav />
// ============================================================

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

const GOLD  = "#b8952e";
const DARK  = "#080808";
const LIGHT = "#e8e2d8";

const NAV_ITEMS = [
  {
    label: "Deals",
    sub: "Closeouts & markdowns",
    href: "/browse?badge=sale",
    icon: "◎",
  },
  {
    label: "Shop All Parts",
    sub: "88,000+ products",
    href: "/browse",
    icon: "◈",
  },
  {
    label: "Era",
    sub: "Shop by engine generation",
    href: "/#eras",
    icon: "◆",
  },
  {
    label: "Model",
    sub: "Filter by HD model code",
    href: "/browse?filter=model",
    icon: "◇",
  },
  {
    label: "OEM",
    sub: "Search by OEM part number",
    href: "/browse?filter=oem",
    icon: "○",
  },
  {
    label: "My Garage",
    sub: "Your saved bikes & parts",
    href: "/garage",
    icon: "◉",
    gold: true,
  },
];

export default function SideNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* ── Logo button — right side of nav ── */}
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Open navigation"
        style={{
          background: "none", border: "none",
          cursor: "pointer", padding: 0,
          display: "flex", alignItems: "center",
          position: "relative",
        }}
      >
        <motion.img
          src="/images/logo.png"
          alt="Stinkin' Supplies"
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          style={{
            height: 114,
            width: "auto",
            display: "block",
            filter: open ? `drop-shadow(0 0 6px ${GOLD}88)` : "none",
            transition: "filter 0.2s",
          }}
        />
        {/* Small indicator dot */}
        <motion.div
          animate={{ scale: open ? 1 : 0, opacity: open ? 1 : 0 }}
          style={{
            position: "absolute", bottom: -2, right: -2,
            width: 5, height: 5, borderRadius: "50%",
            background: GOLD,
          }}
        />
      </button>

      {/* ── Backdrop ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setOpen(false)}
            style={{
              position: "fixed", inset: 0,
              zIndex: 98,
              background: "rgba(0,0,0,0.72)",
              backdropFilter: "blur(2px)",
              WebkitBackdropFilter: "blur(2px)",
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Side panel ── */}
      <AnimatePresence>
        {open && (
          <motion.nav
            key="panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            style={{
              position: "fixed",
              top: 0, right: 0, bottom: 0,
              width: "min(340px, 88vw)",
              zIndex: 99,
              background: "#050505",
              borderLeft: `1px solid ${GOLD}33`,
              display: "flex", flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Gold top accent */}
            <div style={{
              height: 2,
              background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`,
              flexShrink: 0,
            }} />

            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 24px",
              borderBottom: "1px solid #111",
              flexShrink: 0,
            }}>
              <img
                src="/images/logo.png"
                alt="Stinkin' Supplies"
                style={{ height: 32, width: "auto" }}
              />
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none", border: "1px solid #1a1a1a",
                  color: "#444", cursor: "pointer",
                  width: 28, height: 28,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, transition: "all 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = GOLD + "66"; e.currentTarget.style.color = GOLD; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#1a1a1a"; e.currentTarget.style.color = "#444"; }}
              >✕</button>
            </div>

            {/* Nav items */}
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
              {NAV_ITEMS.map((item, i) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.045 + 0.08, duration: 0.22 }}
                >
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    style={{ textDecoration: "none", display: "block" }}
                  >
                    <div
                      style={{
                        display: "flex", alignItems: "center",
                        gap: 16, padding: "14px 24px",
                        borderBottom: "1px solid #0e0e0e",
                        transition: "background 0.12s",
                        cursor: "pointer",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "#0d0d0d"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      {/* Icon */}
                      <div style={{
                        width: 32, height: 32, flexShrink: 0,
                        border: `1px solid ${item.gold ? GOLD + "55" : "#1a1a1a"}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: item.gold ? GOLD : "#333",
                        fontSize: 14,
                        transition: "all 0.15s",
                      }}>
                        {item.icon}
                      </div>

                      {/* Text */}
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
                          fontSize: 22, letterSpacing: "0.06em",
                          color: item.gold ? GOLD : LIGHT,
                          lineHeight: 1,
                        }}>{item.label}</div>
                        <div style={{
                          fontFamily: "var(--font-stencil, 'Share Tech Mono', monospace)",
                          fontSize: 7, letterSpacing: "0.16em",
                          color: "#333", textTransform: "uppercase",
                          marginTop: 3,
                        }}>{item.sub}</div>
                      </div>

                      {/* Arrow */}
                      <div style={{
                        color: item.gold ? GOLD + "88" : "#222",
                        fontSize: 12, transition: "color 0.15s",
                      }}>→</div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>

            {/* Footer */}
            <div style={{
              padding: "16px 24px",
              borderTop: "1px solid #111",
              flexShrink: 0,
            }}>
              <div style={{
                fontFamily: "var(--font-stencil, monospace)",
                fontSize: 7, letterSpacing: "0.2em",
                color: "#222", textTransform: "uppercase",
                textAlign: "center",
              }}>
                ◈ &nbsp;Stinkin&apos; Supplies · 88,000+ Parts
              </div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </>
  );
}