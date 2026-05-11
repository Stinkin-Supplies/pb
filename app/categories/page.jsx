"use client";

// app/categories/page.jsx

import Link from "next/link";
import { motion } from "framer-motion";

const GOLD  = "#C9A84C";
const DARK  = "#080808";
const LIGHT = "#F5F0E8";

export default function CategoriesComingSoon() {
  return (
    <div style={{
      background: DARK,
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 24px",
      fontFamily: "'Barlow Condensed', sans-serif",
      color: LIGHT,
      textAlign: "center",
    }}>

      {/* Animated gold line top */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: "fixed", top: 0, left: 0, right: 0,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`,
          transformOrigin: "left",
        }}
      />

      {/* Badge */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        style={{
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: 9,
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          color: GOLD,
          border: `1px solid rgba(201,168,76,0.3)`,
          padding: "5px 14px",
          marginBottom: 32,
        }}
      >
        Coming Soon
      </motion.div>

      {/* Heading */}
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        style={{
          fontFamily: "'New Sailor', 'Barlow Condensed', sans-serif",
          fontSize: "clamp(52px, 12vw, 120px)",
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          lineHeight: 0.9,
          color: LIGHT,
          marginBottom: 24,
        }}
      >
        Shop by<br />
        <span style={{ color: GOLD }}>Category</span>
      </motion.h1>

      {/* Sub */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        style={{
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: 11,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          color: "rgba(245,240,232,0.35)",
          maxWidth: 380,
          lineHeight: 1.7,
          marginBottom: 48,
        }}
      >
        We're building out full category browsing — engine, exhaust, suspension, electrical, and more. Check back soon.
      </motion.p>

      {/* CTA buttons */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}
      >
        <Link href="/browse" style={{ textDecoration: "none" }}>
          <motion.div
            whileHover={{ background: GOLD, color: DARK, borderColor: GOLD }}
            style={{
              border: `1px solid rgba(201,168,76,0.4)`,
              padding: "12px 28px",
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 10,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: LIGHT,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            Browse All Parts →
          </motion.div>
        </Link>

        <Link href="/era" style={{ textDecoration: "none" }}>
          <motion.div
            whileHover={{ borderColor: "rgba(201,168,76,0.6)", color: GOLD }}
            style={{
              border: "1px solid #1e1e1e",
              padding: "12px 28px",
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 10,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "rgba(245,240,232,0.4)",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            Shop by Era
          </motion.div>
        </Link>
      </motion.div>

      {/* Back home link */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        style={{ marginTop: 48 }}
      >
        <Link
          href="/"
          style={{
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: 9,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "rgba(245,240,232,0.2)",
            textDecoration: "none",
            transition: "color 0.2s",
          }}
          onMouseEnter={e => e.currentTarget.style.color = "rgba(245,240,232,0.5)"}
          onMouseLeave={e => e.currentTarget.style.color = "rgba(245,240,232,0.2)"}
        >
          ← Back to Home
        </Link>
      </motion.div>

      <style>{`
        @font-face {
          font-family: 'NewSailor';
          src: url('/fonts/New_Sailor.ttf') format('truetype');
          font-weight: 100 900;
          font-display: swap;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
      `}</style>
    </div>
  );
}
