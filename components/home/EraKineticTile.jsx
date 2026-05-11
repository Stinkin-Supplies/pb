"use client";

// components/home/EraKineticTile.jsx

import { useState } from "react";
import Link from "next/link";

const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const BASE    = 700;  // bold at rest
const SPREAD  = 3;

function getWeight(i, hovered) {
  if (hovered === null) return BASE;
  const dist = Math.abs(i - hovered);
  if (dist > SPREAD) return BASE;
  const t   = 1 - dist / (SPREAD + 1);
  const idx = Math.round(t * (WEIGHTS.length - 1));
  return WEIGHTS[Math.min(idx, WEIGHTS.length - 1)];
}

// Cream → orange → deep red burn, only on hover chars
function getHoverStyle(w, isHovered) {
  if (!isHovered) return {
    color: "transparent",
    WebkitTextStroke: ".75px rgba(255,255,255,0.9)",
    textShadow: "0 0 18px rgba(255,255,255,0.25), 0 2px 8px rgba(0,0,0,0.6)",
  };
  if (w >= 900) return {
    color: "#fff8e6",
    WebkitTextStroke: "0px transparent",
    textShadow: "0 0 28px rgba(186, 152, 59, 0.9), 0 0 10px rgba(236, 173, 47, 0.7)",
  };
  if (w >= 800) return {
    color: "#ffb347",
    WebkitTextStroke: "0px transparent",
    textShadow: "0 0 20px rgba(232,98,26,0.8), 0 0 8px rgba(200,50,0,0.5)",
  };
  if (w >= 700) return {
    color: "#e8621a",
    WebkitTextStroke: "0px transparent",
    textShadow: "0 0 14px rgba(231, 164, 48, 0.6)",
  };
  return {
    color: "#c0390a",
    WebkitTextStroke: "0px transparent",
    textShadow: "0 0 8px rgba(225, 117, 17, 0.4)",
  };
}

export default function EraKineticTile() {
  const [hovered, setHovered] = useState(null);
  const text = "BROWSE BY ERA";

  return (
    <>
      <style>{`
        @font-face {
          font-family: 'NewSailor';
          src: url('/fonts/New_Sailor.ttf') format('truetype');
          font-weight: 100 900;
          font-display: swap;
        }
      `}</style>

      <Link
        href="/era"
        className="tile tile-era-kinetic"
        style={{ "--delay": "120ms" }}
        aria-label="Browse by Era"
      >
        <div className="era-kinetic-wrap">
          <span
            aria-hidden="true"
            style={{
              display: "inline-flex",
              gap: 0,
              fontFamily: "'NewSailor', 'Barlow Condensed', sans-serif",
              fontSize: "clamp(38px, 7vw, 84px)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              lineHeight: 1,
              userSelect: "none",
            }}
          >
            {text.split("").map((char, i) => {
              const w       = getWeight(i, hovered);
              const isSpace = char === " ";
              const isHot   = hovered !== null && Math.abs(i - hovered) <= SPREAD;
              const { color, textShadow, WebkitTextStroke } = getHoverStyle(w, isHot);
              return (
                <span
                  key={i}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    display:          "inline-block",
                    whiteSpace:       isSpace ? "pre" : "normal",
                    fontWeight:       w,
                    color,
                    textShadow,
                    WebkitTextStroke,
                    transition:       "font-weight 0.1s ease, color 0.1s ease, text-shadow 0.1s ease, -webkit-text-stroke 0.1s ease",
                    cursor:           "pointer",
                  }}
                >
                  {isSpace ? "\u00A0" : char}
                </span>
              );
            })}
          </span>

          <div
            style={{
              marginTop: 10,
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 9,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: hovered !== null ? "rgba(219, 125, 10, 0.7)" : "rgba(233, 147, 55, 0.2)",
              transition: "color 0.1s ease",
            }}
          >
            VIEW ALL ERAS →
          </div>
        </div>
      </Link>
    </>
  );
}

