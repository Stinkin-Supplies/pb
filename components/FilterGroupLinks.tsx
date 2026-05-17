"use client";

import { useState, useRef, useEffect, ComponentProps } from "react";
import { motion, AnimatePresence } from "framer-motion";
import gsap from "gsap";

export const FILTER_GROUP_TO_FAMILY: Record<string, string> = {
  TOURING: "Touring", ROAD_KING: "Touring", STREET_GLIDE: "Touring",
  ROAD_GLIDE: "Touring", TRIKE: "Touring",
  SOFTAIL: "Softail", FAT_BOY: "Softail", HERITAGE: "Softail",
  SPRINGER: "Softail", DELUXE: "Softail", NIGHT_TRAIN: "Softail",
  BREAKOUT: "Softail", LOW_RIDER_S: "Softail",
  DYNA: "Dyna", FXR: "FXR",
  SPORTSTER: "Sportster", IRONHEAD: "Sportster",
  PAN_AMERICA: "Sportster", NIGHTSTER: "Sportster",
  NIGHTSTER_S: "Sportster", SPORTSTER_S: "Sportster",
  PANHEAD: "FXR", KNUCKLEHEAD: "FXR", FLATHEAD: "FXR",
  SHOVELHEAD: "Dyna", WL: "FXR", FX_SUPERGLIDE: "Dyna",
};

type ModalGroup = { key: string; label: string; sub: string; img: string };
type TileConfig = {
  key: string; label: string; sub: string;
  dir: "left" | "right" | "up" | "down";
  span: 1 | 2; size: number; img: string;
  modal?: ModalGroup[]; familyName?: string;
};

const MODAL_TOURING: ModalGroup[] = [
  { key: "TOURING",      label: "Touring",      sub: "Electra Glide · Ultra · Police", img: "/imgs/bikes/touring.jpg"      },
  { key: "ROAD_KING",    label: "Road King",    sub: "FLHR · FLHRC · FLHRSE",         img: "/imgs/bikes/road-king.jpg"    },
  { key: "STREET_GLIDE", label: "Street Glide", sub: "FLHX · CVO · Special",          img: "/imgs/bikes/street-glide.jpg" },
  { key: "ROAD_GLIDE",   label: "Road Glide",   sub: "FLTR · Ultra · Custom",         img: "/imgs/bikes/road-glide.jpg"   },
  { key: "TRIKE",        label: "Trike",        sub: "Tri Glide · Freewheeler",       img: "/imgs/bikes/trike.jpg"        },
];

const MODAL_SOFTAIL: ModalGroup[] = [
  { key: "SOFTAIL",     label: "Softail",     sub: "FXST · FLST · Standard",        img: "/imgs/bikes/softail.jpg"     },
  { key: "FAT_BOY",     label: "Fat Boy",     sub: "FLFB · FLSTF · S",              img: "/imgs/bikes/fat-boy.jpg"     },
  { key: "HERITAGE",    label: "Heritage",    sub: "FLSTC · FLHC · Classic",        img: "/imgs/bikes/heritage.jpg"    },
  { key: "SPRINGER",    label: "Springer",    sub: "FXSTS · FLSTS · Classic",       img: "/imgs/bikes/springer.jpg"    },
  { key: "DELUXE",      label: "Deluxe",      sub: "FLSTN · FLSTNI · SE",           img: "/imgs/bikes/deluxe.jpg"      },
  { key: "NIGHT_TRAIN", label: "Night Train", sub: "FXSTB · FXSTBI",                img: "/imgs/bikes/night-train.jpg" },
  { key: "BREAKOUT",    label: "Breakout",    sub: "FXSB · FXBR · FXBRS",          img: "/imgs/bikes/breakout.jpg"    },
  { key: "LOW_RIDER_S", label: "Low Rider S", sub: "FXLRS · FXLRST",               img: "/imgs/bikes/low-rider-s.jpg" },
];

const MODAL_SPORTSTER: ModalGroup[] = [
  { key: "SPORTSTER", label: "Sportster", sub: "883 · 1200 · Iron · Forty-Eight", img: "/imgs/bikes/sportster.webp" },
  { key: "IRONHEAD",  label: "Ironhead",  sub: "XL · XLCH · XLH · 1957–1985",    img: "/imgs/bikes/sportster.webp" },
];

const MODAL_REVMAX: ModalGroup[] = [
  { key: "PAN_AMERICA", label: "Pan America", sub: "RA1250 · RA1250S · SE · ST",     img: "/imgs/bikes/pan-america.jpg"  },
  { key: "NIGHTSTER",   label: "Nightster",   sub: "RH975 · Special · 2022–present", img: "/imgs/bikes/nightster.jpg"    },
  { key: "SPORTSTER_S", label: "Sportster S", sub: "RH1250S · 2021–present",         img: "/imgs/bikes/sportster-s.jpg"  },
];

const MODAL_VINTAGE: ModalGroup[] = [
  { key: "PANHEAD",       label: "Panhead",     sub: "FL · FLH · 1948–1965",          img: "/imgs/bikes/vintage.webp" },
  { key: "KNUCKLEHEAD",   label: "Knucklehead", sub: "EL · UL · 1936–1947",           img: "/imgs/bikes/vintage.webp" },
  { key: "FLATHEAD",      label: "Flathead",    sub: "V · W · U · 1930–1952",         img: "/imgs/bikes/vintage.webp" },
  { key: "SHOVELHEAD",    label: "Shovelhead",  sub: "FL · FX · 1966–1984",           img: "/imgs/bikes/vintage.webp" },
  { key: "WL",            label: "WL Series",   sub: "WL · WLA · WLC · 1937–1951",    img: "/imgs/bikes/vintage.webp" },
  { key: "FX_SUPERGLIDE", label: "Super Glide", sub: "FX · FXE · FXB · 1971–1986",   img: "/imgs/bikes/vintage.webp" },
];

const TILES: TileConfig[] = [
  { key: "TOURING",        label: "Touring",        sub: "Road King · Street Glide · Road Glide",         dir: "left",  span: 2, size: 52, img: "/imgs/bikes/touring.jpg",        modal: MODAL_TOURING   },
  { key: "SOFTAIL",        label: "Softail",        sub: "Fat Boy · Heritage · Breakout & more",          dir: "up",    span: 1, size: 38, img: "/imgs/bikes/softail.jpg",        modal: MODAL_SOFTAIL   },
  { key: "DYNA",           label: "Dyna",           sub: "Low Rider · Wide Glide · Street Bob",           dir: "right", span: 1, size: 42, img: "/imgs/bikes/dyna.jpg",           familyName: "Dyna"     },
  { key: "FXR",            label: "FXR",            sub: "Low Rider · Sport Glide · Super Glide",         dir: "down",  span: 1, size: 56, img: "/imgs/bikes/fxr.webp",            familyName: "FXR"      },
  { key: "SPORTSTER",      label: "Sportster",      sub: "Iron · 883 · 1200 · Ironhead",                  dir: "left",  span: 1, size: 36, img: "/imgs/bikes/sportster.webp",      modal: MODAL_SPORTSTER },
  { key: "REVOLUTION_MAX", label: "Revolution Max", sub: "Pan America · Nightster · Sportster S",         dir: "right", span: 2, size: 40, img: "/imgs/bikes/revolution-max.jpg", modal: MODAL_REVMAX    },
  { key: "VINTAGE",        label: "Vintage",        sub: "Panhead · Knucklehead · Flathead · Shovelhead", dir: "up",    span: 2, size: 48, img: "/imgs/bikes/vintage.webp",        modal: MODAL_VINTAGE   },
];

// ─── CORNER ORNAMENT ─────────────────────────────────────────────────────────
function CornerMarks({ color = "#c9a84c", size = 8 }: { color?: string; size?: number }) {
  const s = size;
  const style: React.CSSProperties = { position: "absolute", width: s, height: s };
  const line: React.CSSProperties = { position: "absolute", background: color };
  return (
    <>
      <span style={{ ...style, top: 5, left: 5 }}>
        <span style={{ ...line, top: 0, left: 0, width: s, height: 1 }} />
        <span style={{ ...line, top: 0, left: 0, width: 1, height: s }} />
      </span>
      <span style={{ ...style, top: 5, right: 5 }}>
        <span style={{ ...line, top: 0, right: 0, width: s, height: 1 }} />
        <span style={{ ...line, top: 0, right: 0, width: 1, height: s }} />
      </span>
      <span style={{ ...style, bottom: 5, left: 5 }}>
        <span style={{ ...line, bottom: 0, left: 0, width: s, height: 1 }} />
        <span style={{ ...line, bottom: 0, left: 0, width: 1, height: s }} />
      </span>
      <span style={{ ...style, bottom: 5, right: 5 }}>
        <span style={{ ...line, bottom: 0, right: 0, width: s, height: 1 }} />
        <span style={{ ...line, bottom: 0, right: 0, width: 1, height: s }} />
      </span>
    </>
  );
}

// ─── LAYERED STACK ────────────────────────────────────────────────────────────
function LayeredStack({ children, className, ...props }: ComponentProps<"div">) {
  const containerRef = useRef<HTMLDivElement>(null);

  const stackCards = () => {
    const container = containerRef.current;
    if (!container) return;
    const cards = Array.from(container.children) as HTMLElement[];
    cards.forEach((card, i) => {
      const offsetX = container.clientWidth / 2 - card.offsetWidth / 2 - card.offsetLeft;
      const offsetY = container.clientHeight / 2 - card.offsetHeight / 2 - card.offsetTop;
      gsap.to(card, { x: offsetX, y: offsetY, rotate: "random(-15,15)", zIndex: 100 - i, duration: 0.5, ease: "power2.out", overwrite: true });
    });
  };

  const resetCards = () => {
    const container = containerRef.current;
    if (!container) return;
    gsap.to(Array.from(container.children), { x: 0, y: 0, zIndex: 1, duration: 0.6, rotate: 0, ease: "power3.out", stagger: { amount: 0.05, from: "start" }, overwrite: true });
  };

  useEffect(() => { const t = setTimeout(stackCards, 100); return () => clearTimeout(t); }, []);

  return (
    <div ref={containerRef} onMouseEnter={resetCards} onMouseLeave={stackCards}
      className={["relative", className].filter(Boolean).join(" ")} {...props}>
      {children}
    </div>
  );
}

// ─── MODAL CARD ───────────────────────────────────────────────────────────────
function ModalCard({ groupKey, label, sub, imgSrc, onSelect }: {
  groupKey: string; label: string; sub: string; imgSrc: string; onSelect: (key: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect(groupKey)}
      style={{
        position: "relative", width: 150, height: 190,
        background: hovered ? "#c9a84c" : "#f0ebe3",
        border: `3px solid ${hovered ? "#080706" : "#080706"}`,
        borderRadius: 2, overflow: "hidden", cursor: "pointer",
        display: "flex", flexDirection: "column", justifyContent: "flex-end",
        padding: "12px 14px", textAlign: "left", flexShrink: 0,
        transition: "background 0.18s",
        boxShadow: hovered ? "4px 4px 0 #080706" : "2px 2px 0 #080706",
      }}
    >
      {/* image — dimmed on cream, more visible on hover */}
      <div style={{ position: "absolute", inset: 0 }}>
        <img src={imgSrc} alt="" aria-hidden
          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
          style={{ width: "100%", height: "100%", objectFit: "cover",
            filter: hovered ? "brightness(0.75) contrast(0) saturate(0) invert(0) opacity(0.5)" : "brightness(0.5) contrast(1.3) saturate(0) invert(1) opacity(0.9)",
            transition: "filter 0.18s" }} />
      </div>

      {/* top gold bar */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: "#c9a84c",
        transform: hovered ? "scaleX(1)" : "scaleX(0.3)",
        transformOrigin: "left",
        transition: "transform 0.25s cubic-bezier(0.25,0.46,0.45,0.94)",
      }} />

      <CornerMarks color={hovered ? "#080706" : "#c9a84c"} size={7} />

      <div style={{
        position: "relative", zIndex: 1,
        fontFamily: "var(--font-sailor, serif)", fontSize: 26,
        textTransform: "uppercase", letterSpacing: "0.025em", lineHeight: 1,
        color: hovered ? "#080706" : "#080706",
        marginBottom: 5,
      }}>{label}</div>

      <div style={{
        position: "relative", zIndex: 1,
        fontFamily: "var(--font-stencil, monospace)", fontSize: 7,
        textTransform: "uppercase", letterSpacing: "0.1em",
        color: hovered ? "#080706" : "#6b5f3a",
        lineHeight: 1.4, transition: "color 0.18s",
      }}>{sub}</div>
    </button>
  );
}

// ─── GROUP MODAL ──────────────────────────────────────────────────────────────
function GroupModal({ tile, onSelect, onClose }: {
  tile: TileConfig; onSelect: (key: string) => void; onClose: () => void;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <motion.div
      ref={backdropRef}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={e => { if (e.target === backdropRef.current) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(8,7,6,0.92)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        style={{
          background: "#f0ebe3",
          border: "3px solid #080706",
          borderRadius: 2,
          padding: "32px 36px 36px",
          maxWidth: 780, width: "100%",
          boxShadow: "6px 6px 0 #080706",
          position: "relative",
        }}
      >
        {/* gold top accent bar */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: "#c9a84c" }} />
        <CornerMarks color="#c9a84c" size={10} />

        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6, marginTop: 8 }}>
          <div style={{
            fontFamily: "var(--font-sailor, serif)", fontSize: 52,
            textTransform: "uppercase", letterSpacing: "0.025em",
            color: "#080706", lineHeight: 1,
          }}>{tile.label}</div>
          <button onClick={onClose} style={{
            background: "transparent", border: "none",
            color: "#080706", fontFamily: "var(--font-stencil, monospace)",
            fontSize: 8, letterSpacing: "0.2em", textTransform: "uppercase",
            cursor: "pointer", opacity: 0.4,
          }}>ESC ✕</button>
        </div>

        {/* gold rule */}
        <div style={{ height: 2, background: "#c9a84c", marginBottom: 6 }} />

        <div style={{
          fontFamily: "var(--font-stencil, monospace)", fontSize: 8,
          letterSpacing: "0.16em", textTransform: "uppercase",
          color: "#6b5f3a", marginBottom: 28,
        }}>{tile.sub}</div>

        <LayeredStack style={{ display: "flex", flexWrap: "wrap", gap: 10, minHeight: 230 }}>
          {tile.modal!.map(g => (
            <ModalCard key={g.key} groupKey={g.key} label={g.label} sub={g.sub} imgSrc={g.img}
              onSelect={(key) => { onSelect(key); onClose(); }} />
          ))}
        </LayeredStack>

        <div style={{
          marginTop: 18,
          fontFamily: "var(--font-stencil, monospace)", fontSize: 7.5,
          letterSpacing: "0.16em", textTransform: "uppercase",
          color: "#c9a84c", textAlign: "center",
        }}>Hover to spread · Click to select</div>
      </motion.div>
    </motion.div>
  );
}

// ─── BENTO TILE ───────────────────────────────────────────────────────────────
function BentoTile({ tile, onClick }: { tile: TileConfig; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const bgHidden = {
    left:  { x: "-108%", y: "0%"   },
    right: { x: "108%",  y: "0%"   },
    up:    { x: "0%",    y: "-108%" },
    down:  { x: "0%",    y: "108%"  },
  }[tile.dir];

  return (
    <motion.button
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onClick={onClick}
      style={{
        position: "relative", overflow: "hidden", cursor: "pointer",
        background: hovered ? "#080706" : "#f0ebe3",
        border: "3px solid #080706",
        borderRadius: 2,
        display: "flex", flexDirection: "column", justifyContent: "flex-end",
        padding: "14px 16px 12px", width: "100%", height: "100%",
        textAlign: "left", outline: "none",
        boxShadow: hovered ? "5px 5px 0 #c9a84c" : "3px 3px 0 #080706",
        transition: "background 0.22s, box-shadow 0.22s",
      }}
    >
      {/* slide-in image on hover */}
      <motion.div
        initial={{ ...bgHidden, opacity: 0 }}
        animate={hovered ? { x: "0%", y: "0%", opacity: 1 } : { ...bgHidden, opacity: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 28 }}
        style={{ position: "absolute", inset: 0, zIndex: 0 }}
      >
        <img src={tile.img} alt="" aria-hidden
          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "cover", filter: "brightness(0.5) contrast(1.3) saturate(0) invert(1) opacity(0.15)" }} />
        <div style={{ position: "absolute", inset: 0, background: "rgba(201,168,76,0.06)" }} />
      </motion.div>

      {/* gold top bar — animates in on hover */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: "#c9a84c",
        transform: hovered ? "scaleX(1)" : "scaleX(0)",
        transformOrigin: "left",
        transition: "transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94)",
        zIndex: 2,
      }} />

      <CornerMarks color={hovered ? "#c9a84c" : "#080706"} size={7} />

      {/* model count badge */}
      <div style={{
        position: "absolute", zIndex: 2, top: 10, right: 14,
        fontFamily: "var(--font-stencil, monospace)", fontSize: 7,
        letterSpacing: "0.16em", textTransform: "uppercase",
        color: hovered ? "#c9a84c" : "#6b5f3a",
        transition: "color 0.22s",
      }}>
        {tile.modal ? `${tile.modal.length} models ↗` : "→"}
      </div>

      {/* label */}
      <motion.div
        animate={hovered ? { y: -2, color: "#f0ebe3" } : { y: 0, color: "#080706" }}
        transition={{ duration: 0.22 }}
        style={{
          position: "relative", zIndex: 1,
          fontFamily: "var(--font-sailor, serif)", fontSize: tile.size,
          textTransform: "uppercase", letterSpacing: "0.025em", lineHeight: 1,
        }}
      >
        {tile.label}
      </motion.div>

      {/* sub-label */}
      <motion.div
        animate={hovered ? { color: "#c9a84c" } : { color: "#6b5f3a" }}
        transition={{ duration: 0.22 }}
        style={{
          position: "relative", zIndex: 1,
          fontFamily: "var(--font-stencil, monospace)", fontSize: 7.5,
          textTransform: "uppercase", letterSpacing: "0.08em",
          marginTop: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}
      >
        {tile.sub}
      </motion.div>
    </motion.button>
  );
}

// ─── LAYOUT ───────────────────────────────────────────────────────────────────
// Row definitions: each row is an array of [tileKey, flex]
// flex = relative width weight within the row
const ROWS: [string, number][][] = [
  [["TOURING", 2.2], ["SOFTAIL", 1]],
  [["DYNA", 1], ["FXR", 0.8], ["SPORTSTER", 1]],
  [["REVOLUTION_MAX", 1], ["VINTAGE", 1.4]],
];

const ROW_HEIGHTS = [220, 180, 260]; // px

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────
export default function FilterGroupLinks({ onSelect }: { onSelect: (familyName: string) => void }) {
  const [activeModal, setActiveModal] = useState<TileConfig | null>(null);
  const tileMap = Object.fromEntries(TILES.map(t => [t.key, t]));

  function handleTileClick(tile: TileConfig) {
    if (tile.modal) { setActiveModal(tile); }
    else if (tile.familyName) { onSelect(tile.familyName); }
  }

  function handleModalSelect(key: string) {
    const familyName = FILTER_GROUP_TO_FAMILY[key];
    if (familyName) onSelect(familyName);
    setActiveModal(null);
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}
        style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}
      >
        {ROWS.map((row, rowIdx) => (
          <div key={rowIdx} style={{ display: "flex", gap: 6, height: ROW_HEIGHTS[rowIdx] }}>
            {row.map(([key, flex], tileIdx) => {
              const tile = tileMap[key];
              const globalIdx = ROWS.slice(0, rowIdx).reduce((a, r) => a + r.length, 0) + tileIdx;
              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.14, delay: globalIdx * 0.04 }}
                  style={{ flex, minWidth: 0, height: "100%" }}
                >
                  <BentoTile tile={tile} onClick={() => handleTileClick(tile)} />
                </motion.div>
              );
            })}
          </div>
        ))}
      </motion.div>

      <AnimatePresence>
        {activeModal && (
          <GroupModal tile={activeModal} onSelect={handleModalSelect} onClose={() => setActiveModal(null)} />
        )}
      </AnimatePresence>
    </>
  );
}
