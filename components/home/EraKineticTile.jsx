"use client";

// components/home/EraKineticTile.jsx

import { useState } from "react";
import Link from "next/link";

const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const BASE    = 700;
const SPREAD  = 3;

function getWeight(i, hovered) {
  if (hovered === null) return BASE;
  const dist = Math.abs(i - hovered);
  if (dist > SPREAD) return BASE;
  const t   = 1 - dist / (SPREAD + 1);
  const idx = Math.round(t * (WEIGHTS.length - 1));
  return WEIGHTS[Math.min(idx, WEIGHTS.length - 1)];
}

function getHoverStyle(w, isHovered) {
  // At rest: solid white, no stroke, subtle shadow for depth
  if (!isHovered) return {
    color: "rgba(245, 240, 232, 0.92)",
    WebkitTextStroke: "0px transparent",
    textShadow: "0 2px 12px rgba(0,0,0,0.45)",
  };
  // Hover: burn from cream → orange → deep amber
  if (w >= 900) return {
    color: "#fff8e6",
    WebkitTextStroke: "0px transparent",
    textShadow: "0 0 32px rgba(201,168,76,1), 0 0 12px rgba(236,173,47,0.9), 0 2px 4px rgba(0,0,0,0.4)",
  };
  if (w >= 800) return {
    color: "#ffcc66",
    WebkitTextStroke: "0px transparent",
    textShadow: "0 0 22px rgba(232,98,26,0.9), 0 0 8px rgba(200,120,0,0.6)",
  };
  if (w >= 700) return {
    color: "#e8821a",
    WebkitTextStroke: "0px transparent",
    textShadow: "0 0 16px rgba(231,164,48,0.7)",
  };
  return {
    color: "#c0390a",
    WebkitTextStroke: "0px transparent",
    textShadow: "0 0 8px rgba(225,117,17,0.5)",
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

        /* Tile is fully ghost — no bg, no border, no blur.
           z-index higher than .tile-eras so cards fly "through" it */
        .tile-era-kinetic {
          background: transparent !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          border: none !important;
          box-shadow: none !important;
          z-index: 10;
          pointer-events: none; /* let carousel receive pointer events */
        }

        /* But the text itself IS clickable */
        .era-kinetic-wrap {
          pointer-events: auto;
        }

        /* Carousel tile sits below the label */
        .tile-eras {
          z-index: 1;
          /* Allow cards to overflow the tile bounds and appear to fly out */
          overflow: visible !important;
          margin-top: -20px; /* pull up so cards overlap into the label area */
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
              fontSize: "clamp(52px, 9vw, 120px)",
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
                    transition:       "font-weight 0.1s ease, color 0.1s ease, text-shadow 0.1s ease",
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
              color: hovered !== null ? "rgba(253,202,73,0.93)" : "rgba(180,150,80,0.75)",
              transition: "color 0.15s ease",
            }}
          >
            VIEW ALL ERAS →
          </div>
        </div>
      </Link>
    </>
  );
}
