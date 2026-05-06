"use client";
// components/SideNav.jsx
// Cult-UI SidePanel pattern — panel expands from the logo trigger

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

const GOLD   = "#b8952e";
const LIGHT  = "#e8e2d8";
const MUTED  = "#4a4848";

const NAV_ITEMS = [
  { label: "Deals",          sub: "Closeouts & markdowns",      href: "/browse?badge=sale",   icon: "◎" },
  { label: "Shop All Parts", sub: "88,000+ products",           href: "/browse",               icon: "◈" },
  { label: "Era",            sub: "Shop by engine generation",  href: "/#eras",               icon: "◆" },
  { label: "Model",          sub: "Filter by HD model code",    href: "/browse?filter=model", icon: "◇" },
  { label: "Category",       sub: "Search by category",         href: "/browse?filter=oem",   icon: "○" },
  { label: "My Garage",      sub: "Your saved bikes & parts",   href: "/garage",              icon: "◉", gold: true },
];

export default function SideNav() {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  return (
    <>
    {/* Search dropdown — slides down below header */}
    <AnimatePresence>
      {searchOpen && (
        <motion.div
          key="searchbar"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'fixed',
            top: 120,
            left: 0, right: 0,
            zIndex: 89,
            display: 'flex',
            justifyContent: 'center',
            padding: '12px 20px',
            background: 'rgba(8,8,8,0.97)',
            borderBottom: `1px solid ${GOLD}33`,
            backdropFilter: 'blur(12px)',
          }}
        >
          <form
            onSubmit={e => { e.preventDefault(); if(query.trim()) { window.location.href = '/browse?q=' + encodeURIComponent(query.trim()); }}}
            style={{ display: 'flex', width: '100%', maxWidth: 640, gap: 0 }}
          >
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Escape' && setSearchOpen(false)}
              placeholder="OEM · MODEL · PART"
              autoComplete="off"
              style={{
                flex: 1,
                height: 42,
                background: '#0e0e0e',
                border: `1.5px solid ${GOLD}`,
                borderRight: 'none',
                color: '#e8e2d8',
                fontFamily: "var(--font-stencil, 'Share Tech Mono', monospace)",
                fontSize: 13, letterSpacing: '0.1em',
                padding: '0 16px',
                outline: 'none',
                textTransform: 'uppercase',
                caretColor: GOLD,
              }}
            />
            <button
              type="submit"
              style={{
                height: 42, padding: '0 20px',
                background: GOLD, border: 'none',
                fontFamily: "var(--font-stencil, monospace)",
                fontSize: 9, letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: '#080808', cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >Search</button>
            <button
              type="button"
              onClick={() => setSearchOpen(false)}
              style={{
                height: 42, width: 42,
                background: '#111', border: `1.5px solid ${GOLD}44`,
                borderLeft: 'none',
                color: GOLD, cursor: 'pointer', fontSize: 16,
              }}
            >✕</button>
          </form>
        </motion.div>
      )}
    </AnimatePresence>

    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 16 }}>

      {/* ── Expanded panel — animates from logo position ── */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setOpen(false)}
              style={{
                position: "fixed", inset: 0, zIndex: 98,
                background: "rgba(0,0,0,0.6)",
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
              }}
            />

            {/* Panel — expands from top-right origin */}
            <motion.div
              key="panel"
              initial={{ opacity: 0, scale: 0.92, y: -12, x: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: -12, x: 12 }}
              transition={{ type: "spring", stiffness: 340, damping: 30 }}
              style={{
                position: "fixed",
                top: 0, right: 0,
                width: "min(380px, 92vw)",
                height: "100vh",
                zIndex: 999,
                background: "#100f0a",
                borderLeft: `1.5px solid ${GOLD}55`,
                display: "flex", flexDirection: "column",
                transformOrigin: "top right",
                overflow: "hidden",
              }}
            >
              {/* Gold accent top */}
              <div style={{
                height: 2,
                background: `linear-gradient(90deg, transparent, ${GOLD}cc, transparent)`,
                flexShrink: 0,
              }} />

              {/* Header row — logo left, close right */}
              <div style={{
                display: "flex", alignItems: "center",
                justifyContent: "space-between",
                padding: "0 20px",
                height: 72, flexShrink: 0,
                borderBottom: `1px solid ${GOLD}1a`,
              }}>
                <img
                  src="/images/logo.png"
                  alt="Stinkin' Supplies"
                  style={{ height: 48, width: "auto" }}
                />
                <button
                  onClick={() => setOpen(false)}
                  style={{
                    background: "none",
                    border: `1px solid ${GOLD}44`,
                    color: GOLD, cursor: "pointer",
                    width: 34, height: 34,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, transition: "all 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = `${GOLD}22`}
                  onMouseLeave={e => e.currentTarget.style.background = "none"}
                >✕</button>
              </div>

              {/* Nav items */}
              <nav style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
                {NAV_ITEMS.map((item, i) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.055 + 0.05, duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      style={{ textDecoration: "none", display: "block" }}
                    >
                      <div
                        style={{
                          display: "flex", alignItems: "center",
                          gap: 18, padding: "16px 24px",
                          borderBottom: `1px solid ${GOLD}12`,
                          cursor: "pointer", transition: "background 0.12s",
                          position: "relative", overflow: "hidden",
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = `${GOLD}0a`;
                          e.currentTarget.querySelector(".arr").style.color = item.gold ? GOLD : `${GOLD}99`;
                          e.currentTarget.querySelector(".arr").style.transform = "translateX(4px)";
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.querySelector(".arr").style.color = item.gold ? `${GOLD}88` : `${GOLD}33`;
                          e.currentTarget.querySelector(".arr").style.transform = "translateX(0)";
                        }}
                      >
                        {/* Icon */}
                        <div style={{
                          width: 38, height: 38, flexShrink: 0,
                          border: `1px solid ${item.gold ? GOLD : GOLD + "33"}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: item.gold ? GOLD : `${GOLD}77`,
                          fontSize: 17,
                        }}>
                          {item.icon}
                        </div>

                        {/* Text */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
                            fontSize: 28, letterSpacing: "0.05em",
                            color: item.gold ? GOLD : LIGHT,
                            lineHeight: 1,
                          }}>{item.label}</div>
                          <div style={{
                            fontFamily: "var(--font-stencil, 'Share Tech Mono', monospace)",
                            fontSize: 8, letterSpacing: "0.16em",
                            color: `${GOLD}44`, textTransform: "uppercase",
                            marginTop: 4,
                          }}>{item.sub}</div>
                        </div>

                        {/* Arrow */}
                        <div
                          className="arr"
                          style={{
                            color: item.gold ? `${GOLD}88` : `${GOLD}33`,
                            fontSize: 14, flexShrink: 0,
                            transition: "transform 0.2s, color 0.2s",
                          }}
                        >→</div>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </nav>

              {/* Footer */}
              <div style={{
                padding: "16px 24px",
                borderTop: `1px solid ${GOLD}18`,
                flexShrink: 0,
              }}>
                <div style={{
                  fontFamily: "var(--font-stencil, monospace)",
                  fontSize: 7, letterSpacing: "0.22em",
                  color: `${GOLD}33`, textTransform: "uppercase",
                  textAlign: "center",
                }}>
                  ◈ &nbsp;Stinkin&apos; Supplies · 88,000+ Parts
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Search icon trigger ── */}
      <motion.button
        onClick={() => { setSearchOpen(v => !v); setOpen(false); }}
        aria-label="Search"
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        style={{
          background: 'none', border: 'none',
          cursor: 'pointer', padding: 0,
          display: 'flex', alignItems: 'center',
        }}
      >
        <img
          src="/images/searchicon.png"
          alt="Search"
          style={{
            height:40, width: 'auto', display: 'block',
            filter: searchOpen ? `drop-shadow(0 0 8px ${GOLD}bb)` : 'brightness(0.7)',
            transition: 'filter 0.2s',
          }}
        />
      </motion.button>

      {/* ── Logo trigger ── */}
      <motion.button
        onClick={() => setOpen(v => !v)}
        aria-label="Open navigation"
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        style={{
          background: "none", border: "none",
          cursor: "pointer", padding: 0,
          display: "flex", alignItems: "center",
          position: "relative", zIndex: open ? 1000 : "auto",
        }}
      >
        <img
          src="/images/logo.png"
          alt="Stinkin' Supplies"
          style={{
            height: 114, width: "auto", display: "block",
            filter: open ? `drop-shadow(0 0 10px ${GOLD}aa)` : "none",
            transition: "filter 0.25s",
          }}
        />
      </motion.button>
    </div>
  </>
  );
}