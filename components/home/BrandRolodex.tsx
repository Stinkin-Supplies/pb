"use client";

import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimate } from "framer-motion";

type Brand = {
  name: string;
  logo: string;
  count: string;
};

const BRANDS: Brand[] = [
  { name: "Drag Specialties",   logo: "/brands/drag-specialties.svg",   count: "6,486 parts"  },
  { name: "V-Twin",             logo: "/brands/v-twin.svg",             count: "18,041 parts" },
  { name: "Colony",             logo: "/brands/colony.svg",             count: "2,906 parts"  },
  { name: "HardDrive",          logo: "/brands/harddrive.svg",          count: "2,371 parts"  },
  { name: "LA Choppers",        logo: "/brands/la-choppers.svg",        count: "1,632 parts"  },
  { name: "James Gaskets",      logo: "/brands/james-gasket.svg",       count: "1,948 parts"  },
  { name: "Arlen Ness",         logo: "/brands/arlen-ness.svg",         count: "1,444 parts"  },
  { name: "NAMZ Custom Cycle",  logo: "/brands/namz.png",               count: "1,421 parts"  },
  { name: "Saddlemen",          logo: "/brands/saddlemen.svg",          count: "1,405 parts"  },
  { name: "S&S Cycle",          logo: "/brands/ss-cycle.svg",           count: "1,307 parts"  },
  { name: "Cometic",            logo: "/brands/cometic.svg",            count: "1,093 parts"  },
  { name: "Motion Pro",         logo: "/brands/motion-pro.svg",         count: "922 parts"    },
  { name: "Burly Brand",        logo: "/brands/burly-brand.svg",        count: "872 parts"    },
  { name: "Barnett",            logo: "/brands/barnett.png",            count: "779 parts"    },
  { name: "Cobra",              logo: "/brands/cobra.svg",              count: "712 parts"    },
  { name: "Fox Racing",         logo: "/brands/fox.svg",                count: "654 parts"    },
  { name: "Kibblewhite",        logo: "/brands/kibblewhite.svg",        count: "615 parts"    },
  { name: "Klock Werks",        logo: "/brands/klock-werks.svg",        count: "320 parts"    },
  { name: "Legend Suspensions", logo: "/brands/legend-suspensions.svg", count: "280 parts"    },
];

const DELAY_IN_MS = 2800;
const TRANSITION_SECS = 1.4;

function BrandFace({ brand }: { brand: Brand }) {
  const [failed, setFailed] = useState(false);
  return (
    <div style={{
      width: 480,
      height: 300,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 20,
      borderRadius: 12,
      background: "#131313",
    }}>
      {!failed ? (
        <img
          src={brand.logo}
          alt={brand.name}
          onError={() => setFailed(true)}
          style={{
            width: 320,
            height: 120,
            objectFit: "contain",
          }}
        />
      ) : (
        <span style={{
          color: "#e0e0e0",
          fontSize: 22,
          fontWeight: 700,
          textAlign: "center",
          padding: "0 32px",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}>
          {brand.name}
        </span>
      )}
      <span style={{
        color: "#2aaa7a",
        fontSize: 12,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
      }}>
        {brand.count}
      </span>
    </div>
  );
}

function LogoRolodex({ items }: { items: React.ReactNode[] }) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    intervalRef.current = setInterval(() => setIndex(pv => pv + 1), DELAY_IN_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  return (
    <div style={{ perspective: "1200px" }}>
      <div style={{
        width: 500,
        height: 320,
        position: "relative",
        transform: "rotateY(-14deg)",
        transformStyle: "preserve-3d",
        borderRadius: 16,
        border: "1px solid #252525",
        background: "#131313",
        boxShadow: "0 20px 60px rgba(0,0,0,0.8), 0 4px 12px rgba(0,0,0,0.5)",
        flexShrink: 0,
      }}>
        <AnimatePresence mode="sync">
          <motion.div
            key={`top-${index}`}
            style={{
              position: "absolute",
              left: "50%", top: "50%",
              x: "-50%", y: "-50%",
              clipPath: "polygon(0 0, 100% 0, 100% 50%, 0 50%)",
              zIndex: -index,
              backfaceVisibility: "hidden",
            }}
            transition={{ duration: TRANSITION_SECS, ease: "easeInOut" }}
            initial={{ rotateX: "0deg" }}
            animate={{ rotateX: "0deg" }}
            exit={{ rotateX: "-180deg" }}
          >
            {items[index % items.length]}
          </motion.div>

          <motion.div
            key={`bot-${(index + 1) * 2}`}
            style={{
              position: "absolute",
              left: "50%", top: "50%",
              x: "-50%", y: "-50%",
              clipPath: "polygon(0 50%, 100% 50%, 100% 100%, 0 100%)",
              zIndex: index,
              backfaceVisibility: "hidden",
            }}
            initial={{ rotateX: "180deg" }}
            animate={{ rotateX: "0deg" }}
            exit={{ rotateX: "0deg" }}
            transition={{ duration: TRANSITION_SECS, ease: "easeInOut" }}
          >
            {items[index % items.length]}
          </motion.div>
        </AnimatePresence>

        {/* Seam */}
        <div style={{
          position: "absolute",
          left: 0, right: 0,
          top: "50%",
          height: 1,
          background: "#080808",
          zIndex: 999,
          transform: "translateZ(1px)",
        }} />
      </div>
    </div>
  );
}


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

const BRANDS_GRID = [
  { name: "Drag Specialties", logo: "/brands/drag-specialties.svg", href: "/browse?brand=Drag+Specialties" },
  { name: "V-Twin",           logo: "/brands/v-twin.svg",           href: "/browse?brand=V-Twin"           },
  { name: "Arlen Ness",       logo: "/brands/arlen-ness.svg",       href: "/browse?brand=Arlen+Ness"       },
  { name: "S&S Cycle",        logo: "/brands/ss-cycle.svg",         href: "/browse?brand=S%26S+Cycle"      },
  { name: "Saddlemen",        logo: "/brands/saddlemen.svg",        href: "/browse?brand=Saddlemen"        },
  { name: "Cometic",          logo: "/brands/cometic.svg",          href: "/browse?brand=Cometic"          },
  { name: "James Gaskets",    logo: "/brands/james-gasket.svg",     href: "/browse?brand=James+Gaskets"    },
  { name: "Motion Pro",       logo: "/brands/motion-pro.svg",       href: "/browse?brand=Motion+Pro"       },
  { name: "Cobra",            logo: "/brands/cobra.svg",            href: "/browse?brand=Cobra"            },
];

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

  return (
    <a
      href={href}
      onMouseEnter={(e) => animate(scope.current, { clipPath: ENTRANCE_KEYFRAMES[getNearestSide(e)] })}
      onMouseLeave={(e) => animate(scope.current, { clipPath: EXIT_KEYFRAMES[getNearestSide(e)] })}
      style={{
        position: "relative",
        display: "grid",
        placeContent: "center",
        height: 110,
        width: "100%",
        background: "#0e0e0e",
        overflow: "hidden",
        textDecoration: "none",
      }}
    >
      {!imgFailed ? (
        <img src={logo} alt={name} onError={() => setImgFailed(true)}
          style={{ width: 110, height: 38, objectFit: "contain", opacity: 0.45 }} />
      ) : (
        <span style={{ color: "#444", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}>{name}</span>
      )}
      <div ref={scope} style={{
        clipPath: BOTTOM_RIGHT_CLIP,
        position: "absolute", inset: 0,
        display: "grid", placeContent: "center",
        background: "#181818",
      }}>
        {!imgFailed ? (
          <img src={logo} alt={name}
            style={{ width: 110, height: 38, objectFit: "contain", opacity: 1 }} />
        ) : (
          <span style={{ color: "#e0e0e0", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}>{name}</span>
        )}
      </div>
    </a>
  );
}

function BrandGrid() {
  const divider = "1px solid #1a1a1a";
  return (
    <div style={{ border: divider, width: "100%" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: divider }}>
        {BRANDS_GRID.slice(0, 2).map((b, i) => (
          <div key={b.name} style={{ borderRight: i === 0 ? divider : "none" }}><BrandBox {...b} /></div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", borderBottom: divider }}>
        {BRANDS_GRID.slice(2, 6).map((b, i) => (
          <div key={b.name} style={{ borderRight: i < 3 ? divider : "none" }}><BrandBox {...b} /></div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
        {BRANDS_GRID.slice(6, 9).map((b, i) => (
          <div key={b.name} style={{ borderRight: i < 2 ? divider : "none" }}><BrandBox {...b} /></div>
        ))}
      </div>
    </div>
  );
}

export function BrandRolodex() {
  return (
    <section style={{
      width: "100%",
      padding: "56px 48px",
      display: "flex",
      gap: 56,
      alignItems: "center",
      boxSizing: "border-box",
    }}>
      {/* LEFT — rolodex */}
      <LogoRolodex
        items={BRANDS.map(brand => (
          <BrandFace key={brand.name} brand={brand} />
        ))}
      />

      {/* RIGHT — brand grid */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <BrandGrid />
      </div>
    </section>
  );
}
