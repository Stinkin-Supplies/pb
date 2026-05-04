"use client";
/**
 * components/GlobalSearch.tsx
 * Compact nav search with opaque gold cloud backdrop on open.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface SearchHit {
  id: string;
  slug: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  image: string | null;
  inStock: boolean;
}

interface GlobalSearchProps {
  placeholder?: string;
  className?: string;
}

const DEBOUNCE_MS = 250;
const GOLD = "#b8952e";

export default function GlobalSearch({
  placeholder = "OEM · MODEL · PART",
  className = "",
}: GlobalSearchProps) {
  const router = useRouter();
  const [input,   setInput]   = useState("");
  const [hits,    setHits]    = useState<SearchHit[]>([]);
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [cursor,  setCursor]  = useState(-1);

  const wrapRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchHits = useCallback(async (q: string) => {
    if (!q.trim()) { setHits([]); setOpen(false); return; }
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    try {
      const res  = await fetch(
        `/api/search?q=${encodeURIComponent(q)}&per_page=6`,
        { signal: abortRef.current.signal }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setHits(data.products ?? data.hits ?? []);
      setOpen(true);
      setCursor(-1);
    } catch (err: any) {
      if (err.name !== "AbortError") setHits([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => fetchHits(input), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [input, fetchHits]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (!q) return;
    setOpen(false);
    router.push(`/browse?q=${encodeURIComponent(q)}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || hits.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor(c => Math.min(c + 1, hits.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor(c => Math.max(c - 1, -1)); }
    else if (e.key === "Enter" && cursor >= 0) { e.preventDefault(); setOpen(false); router.push(`/browse/${hits[cursor].slug}`); }
    else if (e.key === "Escape") { setOpen(false); }
  };

  const clear = () => { setInput(""); setHits([]); setOpen(false); inputRef.current?.focus(); };

  return (
    <>
      {/* Opaque cloud backdrop */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 998,
            background: `radial-gradient(ellipse 55% 22% at 50% 0%, rgba(184,149,46,0.11) 0%, rgba(12,10,8,0.78) 55%, rgba(0,0,0,0.6) 100%)`,
            backdropFilter: "blur(3px)",
            WebkitBackdropFilter: "blur(3px)",
          }}
        />
      )}

      <div
        ref={wrapRef}
        className={`gs-wrap ${className}`}
        style={{ position: "relative", width: "100%", maxWidth: 480, zIndex: 999 }}
      >
        {/* Input row */}
        <form onSubmit={handleSubmit} style={{ display: "flex", height: 32 }}>
          <div style={{ position: "relative", flex: 1, display: "flex" }}>
            {/* Magnifier icon */}
            <div style={{
              position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
              pointerEvents: "none", display: "flex", alignItems: "center",
            }}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="5" stroke={open ? GOLD : "#3a3838"} strokeWidth="1.5" style={{ transition: "stroke 0.2s" }} />
                <path d="M11 11L15 15" stroke={open ? GOLD : "#3a3838"} strokeWidth="1.5" strokeLinecap="round" style={{ transition: "stroke 0.2s" }} />
              </svg>
            </div>

            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => { setInput(e.target.value); if (!e.target.value) setOpen(false); }}
              onKeyDown={handleKeyDown}
              onFocus={() => { if (hits.length > 0) setOpen(true); }}
              placeholder={placeholder}
              autoComplete="off"
              style={{
                flex: 1, height: "100%",
                background: open ? "#0e0d0d" : "#141313",
                border: `1px solid ${open ? GOLD : "#2a2828"}`,
                borderRight: "none",
                borderRadius: "2px 0 0 2px",
                color: "#f0ebe3",
                fontFamily: "var(--font-stencil, monospace)",
                fontSize: 11, letterSpacing: "0.1em",
                padding: "0 28px 0 30px",
                outline: "none",
                transition: "border-color 0.2s, background 0.2s",
                textTransform: "uppercase",
              }}
            />

            {input && (
              <button type="button" onClick={clear} style={{
                position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", color: "#4a4848",
                fontSize: 11, cursor: "pointer", padding: "0 2px", lineHeight: 1, zIndex: 1,
              }}>✕</button>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            style={{
              width: 36, height: "100%", flexShrink: 0,
              background: open ? GOLD : "#1e1d1d",
              border: `1px solid ${open ? GOLD : "#2a2828"}`,
              borderLeft: "none",
              borderRadius: "0 2px 2px 0",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.2s, border-color 0.2s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = GOLD)}
            onMouseLeave={e => (e.currentTarget.style.background = open ? GOLD : "#1e1d1d")}
            aria-label="Search"
          >
            {loading ? (
              <span style={{
                width: 10, height: 10,
                border: "1.5px solid #0a0909", borderTopColor: "transparent",
                borderRadius: "50%", display: "inline-block",
                animation: "gs-spin 0.7s linear infinite",
              }} />
            ) : (
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="5" stroke={open ? "#0a0909" : "#6a6868"} strokeWidth="1.5" />
                <path d="M11 11L15 15" stroke={open ? "#0a0909" : "#6a6868"} strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </form>

        {/* Dropdown */}
        {open && hits.length > 0 && (
          <div style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: "-20px", right: "-20px",
            background: "#0c0b0b",
            border: `1px solid ${GOLD}44`,
            borderRadius: 2,
            zIndex: 9999,
            boxShadow: `0 24px 64px rgba(0,0,0,0.9), 0 0 0 1px ${GOLD}18`,
            overflow: "hidden",
          }}>
            {/* Gold accent line */}
            <div style={{ height: 1.5, background: `linear-gradient(90deg, transparent, ${GOLD}99, transparent)` }} />

            {hits.map((hit, i) => (
              <DropdownRow
                key={hit.id}
                hit={hit}
                query={input}
                active={cursor === i}
                onMouseEnter={() => setCursor(i)}
                onClick={() => { setOpen(false); router.push(`/browse/${hit.slug}`); }}
              />
            ))}

            <button
              onClick={() => { setOpen(false); router.push(`/browse?q=${encodeURIComponent(input)}`); }}
              style={{
                display: "block", width: "100%",
                padding: "10px 14px",
                background: "#080808", border: "none",
                borderTop: "1px solid #1a1919",
                color: GOLD,
                fontFamily: "var(--font-stencil, monospace)",
                fontSize: 9, letterSpacing: "0.18em",
                cursor: "pointer", textAlign: "left",
                transition: "background 0.15s",
                textTransform: "uppercase",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#111")}
              onMouseLeave={e => (e.currentTarget.style.background = "#080808")}
            >
              See all results for &ldquo;{input}&rdquo; →
            </button>
          </div>
        )}

        <style>{`@keyframes gs-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </>
  );
}

function DropdownRow({ hit, query, active, onMouseEnter, onClick }: {
  hit: SearchHit; query: string; active: boolean;
  onMouseEnter: () => void; onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 14px", cursor: "pointer",
        background: active ? `rgba(184,149,46,0.07)` : "transparent",
        borderBottom: "1px solid #111",
        transition: "background 0.1s",
      }}
    >
      <div style={{
        width: 36, height: 36, flexShrink: 0,
        background: "#fff", borderRadius: 2, overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center",
        border: "1px solid #1a1919",
      }}>
        {hit.image
          ? <img src={hit.image} alt={hit.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <span style={{ fontSize: 7, color: "#8a8784", fontFamily: "monospace" }}>—</span>
        }
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "#e8e2d8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.3 }}>
          {highlightMatch(hit.name, query)}
        </div>
        <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 8, color: "#4a4848", letterSpacing: "0.1em", marginTop: 2, textTransform: "uppercase" }}>
          {hit.brand}{hit.category && <span style={{ color: "#2a2828" }}> · {hit.category}</span>}
        </div>
      </div>

      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontFamily: "var(--font-caesar, sans-serif)", fontSize: 16, color: "#e8e2d8", letterSpacing: "0.04em" }}>
          ${hit.price?.toFixed(2) ?? "—"}
        </div>
        {!hit.inStock && <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 7, color: "#4a4848", letterSpacing: "0.1em" }}>OOS</div>}
      </div>
    </div>
  );
}

function highlightMatch(text: string, query: string) {
  if (!query || !text) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: "rgba(184,149,46,0.18)", color: "#b8952e", borderRadius: 1, padding: "0 2px" }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}