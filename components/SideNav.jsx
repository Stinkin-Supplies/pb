"use client";
// components/SideNav.jsx

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

const GOLD  = "#b8952e";
const LIGHT = "#e8e2d8";
const PANEL_BG = "#111008"; // warm dark — visible against black page

const NAV_ITEMS = [
  { label: "Deals",          sub: "Closeouts & markdowns",      href: "/browse?badge=sale",   icon: "◎" },
  { label: "Shop All Parts", sub: "88,000+ products",           href: "/browse",               icon: "◈" },
  { label: "Era",            sub: "Shop by engine generation",  href: "/#eras",               icon: "◆" },
  { label: "Model",          sub: "Filter by HD model code",    href: "/browse?filter=model", icon: "◇" },
  { label: "OEM",            sub: "Search by OEM part number",  href: "/browse?filter=oem",   icon: "○" },
  { label: "My Garage",      sub: "Your saved bikes & parts",   href: "/garage",              icon: "◉", gold: true },
];

export default function SideNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Logo trigger */}
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
            height: 114, width: "auto", display: "block",
            filter: open ? `drop-shadow(0 0 8px ${GOLD}99)` : "none",
            transition: "filter 0.2s",
          }}
        />
      </button>

      {/* Backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="bd"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setOpen(false)}
            style={{
              position: "fixed", inset: 0, zIndex: 998,
              background: "rgba(0,0,0,0.65)",
              backdropFilter: "blur(3px)",
              WebkitBackdropFilter: "blur(3px)",
            }}
          />
        )}
      </AnimatePresence>

      {/* Side panel */}
      <AnimatePresence>
        {open && (
          <motion.nav
            key="panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            style={{
              position: "fixed",
              top: 0, right: 0, bottom: 0,
              width: "min(360px, 90vw)",
              zIndex: 999,
              background: PANEL_BG,
              borderLeft: `2px solid ${GOLD}66`,
              display: "flex", flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Gold top bar */}
            <div style={{
              height: 3,
              background: `linear-gradient(90deg, transparent, ${GOLD}, ${GOLD}88, transparent)`,
              flexShrink: 0,
            }} />

            {/* Close row */}
            <div style={{
              display: "flex", alignItems: "center",
              justifyContent: "flex-end",
              padding: "14px 20px",
              borderBottom: `1px solid ${GOLD}22`,
              flexShrink: 0,
            }}>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none",
                  border: `1px solid ${GOLD}44`,
                  color: GOLD, cursor: "pointer",
                  width: 32, height: 32,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, transition: "all 0.15s",
                  fontFamily: "var(--font-stencil, monospace)",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = GOLD + "22"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
              >✕</button>
            </div>

            {/* Nav items */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {NAV_ITEMS.map((item, i) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 + 0.05, duration: 0.2 }}
                >
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    style={{ textDecoration: "none", display: "block" }}
                  >
                    <div
                      style={{
                        display: "flex", alignItems: "center",
                        gap: 18, padding: "18px 24px",
                        borderBottom: `1px solid ${GOLD}18`,
                        cursor: "pointer", transition: "background 0.12s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = `${GOLD}0e`}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      {/* Icon box */}
                      <div style={{
                        width: 36, height: 36, flexShrink: 0,
                        border: `1px solid ${item.gold ? GOLD : GOLD + "33"}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: item.gold ? GOLD : `${GOLD}88`,
                        fontSize: 16,
                      }}>
                        {item.icon}
                      </div>

                      {/* Labels */}
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
                          fontSize: 26, letterSpacing: "0.06em",
                          color: item.gold ? GOLD : LIGHT,
                          lineHeight: 1,
                        }}>{item.label}</div>
                        <div style={{
                          fontFamily: "var(--font-stencil, 'Share Tech Mono', monospace)",
                          fontSize: 8, letterSpacing: "0.16em",
                          color: `${GOLD}55`, textTransform: "uppercase",
                          marginTop: 4,
                        }}>{item.sub}</div>
                      </div>

                      {/* Arrow */}
                      <div style={{
                        color: item.gold ? GOLD : `${GOLD}44`,
                        fontSize: 14,
                      }}>→</div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>

            {/* Footer */}
            <div style={{
              padding: "14px 24px",
              borderTop: `1px solid ${GOLD}22`,
              flexShrink: 0,
            }}>
              <div style={{
                fontFamily: "var(--font-stencil, monospace)",
                fontSize: 7, letterSpacing: "0.22em",
                color: `${GOLD}44`, textTransform: "uppercase",
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