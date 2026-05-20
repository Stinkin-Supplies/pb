"use client";

import React, { useState } from "react";
import { useAnimate } from "framer-motion";

// ─── Clip path constants ──────────────────────────────────────────────────────
const NO_CLIP           = "polygon(0 0, 100% 0, 100% 100%, 0% 100%)";
const BOTTOM_RIGHT_CLIP = "polygon(0 0, 100% 0, 0 0, 0% 100%)";
const TOP_RIGHT_CLIP    = "polygon(0 0, 0 100%, 100% 100%, 0% 100%)";
const BOTTOM_LEFT_CLIP  = "polygon(100% 100%, 100% 0, 100% 100%, 0 100%)";
const TOP_LEFT_CLIP     = "polygon(0 0, 100% 0, 100% 100%, 100% 0)";

const ENTRANCE_KEYFRAMES: Record<string, string[]> = {
  left:   [BOTTOM_RIGHT_CLIP, NO_CLIP],
  bottom: [BOTTOM_RIGHT_CLIP, NO_CLIP],
  top:    [BOTTOM_RIGHT_CLIP, NO_CLIP],
  right:  [TOP_LEFT_CLIP,     NO_CLIP],
};
const EXIT_KEYFRAMES: Record<string, string[]> = {
  left:   [NO_CLIP, TOP_RIGHT_CLIP],
  bottom: [NO_CLIP, TOP_RIGHT_CLIP],
  top:    [NO_CLIP, TOP_RIGHT_CLIP],
  right:  [NO_CLIP, BOTTOM_LEFT_CLIP],
};

// ─── Brand data ───────────────────────────────────────────────────────────────
const BRANDS_GRID = [
  // Row 1 — 2 hero brands
  { name: "Drag Specialties",   logo: "/brands/drag-specialties.svg",   href: "/browse?brand=Drag+Specialties"   },
  { name: "Cometic",            logo: "/brands/cometic.svg",            href: "/browse?brand=Cometic"            },
  // Row 2 — 4
  { name: "Arlen Ness",         logo: "/brands/arlen-ness.svg",         href: "/browse?brand=Arlen+Ness"         },
  { name: "S&S Cycle",          logo: "/brands/ss-cycle.svg",           href: "/browse?brand=S%26S+Cycle"        },
  { name: "Saddlemen",          logo: "/brands/saddlemen.svg",          href: "/browse?brand=Saddlemen"          },
  { name: "V-Twin",             logo: "/brands/v-twin.svg",             href: "/browse?brand=V-Twin"             },
  // Row 3 — 4
  { name: "James Gaskets",      logo: "/brands/james-gasket.svg",       href: "/browse?brand=James+Gaskets"      },
  { name: "Motion Pro",         logo: "/brands/motion-pro.svg",         href: "/browse?brand=Motion+Pro"         },
  { name: "Cobra",              logo: "/brands/cobra.svg",              href: "/browse?brand=Cobra"              },
  { name: "LA Choppers",        logo: "/brands/la-choppers.svg",        href: "/browse?brand=LA+Choppers"        },
  // Row 4 — 3
  { name: "Burly Brand",        logo: "/brands/burly-brand.svg",        href: "/browse?brand=Burly+Brand"        },
  { name: "Barnett",            logo: "/brands/barnett.png",            href: "/browse?brand=Barnett"            },
  { name: "HardDrive",          logo: "/brands/harddrive.svg",          href: "/browse?brand=HardDrive"          },
  // Row 5 — 3
  { name: "Fox Racing",         logo: "/brands/fox.svg",                href: "/browse?brand=FLY+RACING"         },
  { name: "Klock Werks",        logo: "/brands/klock-werks.svg",        href: "/browse?brand=Klock+Werks"        },
  { name: "Kibblewhite",        logo: "/brands/kibblewhite.svg",        href: "/browse?brand=Kibblewhite"        },
];

const TILE_HEIGHT = 100;
const LOGO_MAX_W  = "80";
const LOGO_MAX_H  = 85;

// ─── Logo image (shared between default + hover) ───────────────────────────────
function LogoImg({ logo, name, opacity, onError }: {
  logo: string; name: string; opacity: number; onError?: () => void;
}) {
  return (
    <img
      src={logo}
      alt={name}
      onError={onError}
      style={{
        display:       "block",
        width:         "auto",
        height:        "auto",
        maxWidth:      LOGO_MAX_W,
        maxHeight:     LOGO_MAX_H,
        objectFit:     "contain",
        opacity,
      }}
    />
  );
}

// ─── Single brand tile ────────────────────────────────────────────────────────
function BrandBox({ name, logo, href }: { name: string; logo: string; href: string }) {
  const [scope, animate] = useAnimate();
  const [imgFailed, setImgFailed] = useState(false);

  const getNearestSide = (e: React.MouseEvent) => {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return [
      { proximity: Math.abs(box.left   - e.clientX), side: "left"   },
      { proximity: Math.abs(box.right  - e.clientX), side: "right"  },
      { proximity: Math.abs(box.top    - e.clientY), side: "top"    },
      { proximity: Math.abs(box.bottom - e.clientY), side: "bottom" },
    ].sort((a, b) => a.proximity - b.proximity)[0].side;
  };

  const centerStyle: React.CSSProperties = {
    position:       "absolute",
    inset:          0,
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
  };

  return (
    <a
      href={href}
      onMouseEnter={(e) => animate(scope.current, { clipPath: ENTRANCE_KEYFRAMES[getNearestSide(e)] })}
      onMouseLeave={(e) => animate(scope.current, { clipPath: EXIT_KEYFRAMES[getNearestSide(e)] })}
      style={{
        position:       "relative",
        display:        "block",
        height:         TILE_HEIGHT,
        width:          "100%",
        background:     "#f5f0e8",
        overflow:       "hidden",
        textDecoration: "none",
        padding:        0,
      }}
    >
      {/* Default state */}
      <div style={centerStyle}>
        {!imgFailed ? (
          <LogoImg logo={logo} name={name} opacity={0.7} onError={() => setImgFailed(true)} />
        ) : (
          <span style={{ color: "#7a6e5f", fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            {name}
          </span>
        )}
      </div>

      {/* Hover overlay */}
      <div
        ref={scope}
        style={{
          clipPath:   BOTTOM_RIGHT_CLIP,
          position:   "absolute",
          inset:      0,
          display:    "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#e0d9cc",
        }}
      >
        {!imgFailed ? (
          <LogoImg logo={logo} name={name} opacity={1} />
        ) : (
          <span style={{ color: "#2a2218", fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            {name}
          </span>
        )}
      </div>
    </a>
  );
}

// ─── Grid ─────────────────────────────────────────────────────────────────────
function BrandGrid() {
  const divider = "1px solid #c8bfaa";
  const rows = [
    { brands: BRANDS_GRID.slice(0, 2),   cols: "1fr 1fr"         },
    { brands: BRANDS_GRID.slice(2, 6),   cols: "1fr 1fr 1fr 1fr" },
    { brands: BRANDS_GRID.slice(6, 10),  cols: "1fr 1fr 1fr 1fr" },
    { brands: BRANDS_GRID.slice(10, 13), cols: "1fr 1fr 1fr"     },
    { brands: BRANDS_GRID.slice(13, 16), cols: "1fr 1fr 1fr"     },
  ];
  return (
    <div style={{ border: divider, borderRadius: 16, overflow: "hidden", width: "100%" }}>
      {rows.map((row, ri) => (
        <div
          key={ri}
          style={{
            display:             "grid",
            gridTemplateColumns: row.cols,
            borderBottom:        ri < rows.length - 1 ? divider : "none",
          }}
        >
          {row.brands.map((b, i) => (
            <div key={b.name} style={{ borderRight: i < row.brands.length - 1 ? divider : "none" }}>
              <BrandBox {...b} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function BrandRolodex() {
  return (
    <section style={{
      width:       "100%",
      background:  "#f5f0e8",
      padding:     "56px 48px",
      boxSizing:   "border-box",
    }}>
      <BrandGrid />
    </section>
  );
}
