"use client";
/**
 * components/GlobalSearch.tsx
 *
 * Instant-search dropdown that lives in the NavBar.
 * - Debounced 250ms Typesense query via /api/search
 * - Shows top 6 results with image, name, brand, price
 * - Enter / click result → /search?q=... or /browse/[slug]
 * - Escape or click-outside → close
 * - Keyboard: ↑↓ to navigate results, Enter to open highlighted
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
  /** Placeholder text */
  placeholder?: string;
  /** CSS class applied to the wrapper div */
  className?: string;
}

const DEBOUNCE_MS = 250;

export default function GlobalSearch({
  placeholder = "Search parts, brands, OEM#...",
  className = "",
}: GlobalSearchProps) {
  const router = useRouter();
  const [input,    setInput]    = useState("");
  const [hits,     setHits]     = useState<SearchHit[]>([]);
  const [open,     setOpen]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [cursor,   setCursor]   = useState(-1);   // keyboard nav index

  const wrapRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Fetch top 6 results ────────────────────────────────────────
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

  // ── Debounce ───────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => fetchHits(input), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [input, fetchHits]);

  // ── Click outside → close ──────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Submit (Enter with no selection, or search btn) ────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (!q) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  // ── Keyboard nav ───────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || hits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor(c => Math.min(c + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor(c => Math.max(c - 1, -1));
    } else if (e.key === "Enter" && cursor >= 0) {
      e.preventDefault();
      const hit = hits[cursor];
      setOpen(false);
      router.push(`/browse/${hit.slug}`);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const clear = () => {
    setInput("");
    setHits([]);
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div
      ref={wrapRef}
      className={`gs-wrap ${className}`}
      style={{ position: "relative", width: "100%", maxWidth: 480 }}
    >
      {/* ── INPUT ── */}
      <form onSubmit={handleSubmit} style={{ display: "flex", height: 38 }}>
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
            flex: 1,
            height: "100%",
            background: "#1a1919",
            border: "1px solid #2a2828",
            borderRight: "none",
            borderRadius: "2px 0 0 2px",
            color: "#f0ebe3",
            fontFamily: "var(--font-stencil, monospace)",
            fontSize: 13,
            padding: "0 36px 0 14px",
            outline: "none",
            transition: "border-color 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = "#3a3838")}
          onMouseLeave={e => (e.currentTarget.style.borderColor = "#2a2828")}
        />

        {/* Clear button */}
        {input && (
          <button
            type="button"
            onClick={clear}
            style={{
              position: "absolute",
              right: 42,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              color: "#5a5858",
              fontSize: 12,
              cursor: "pointer",
              padding: "0 4px",
              lineHeight: 1,
              zIndex: 1,
            }}
          >
            ✕
          </button>
        )}

        {/* Search button */}
        <button
          type="submit"
          style={{
            width: 42,
            height: "100%",
            flexShrink: 0,
            background: "#e8621a",
            border: "none",
            borderRadius: "0 2px 2px 0",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.15s",
            fontSize: 15,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "#c94f0f")}
          onMouseLeave={e => (e.currentTarget.style.background = "#e8621a")}
          aria-label="Search"
        >
          {loading
            ? <span style={{ width: 14, height: 14, border: "2px solid #0a0909", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "gs-spin 0.7s linear infinite" }} />
            : "🔍"}
        </button>
      </form>

      {/* ── DROPDOWN ── */}
      {open && hits.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "#111010",
            border: "1px solid #2a2828",
            borderRadius: 2,
            zIndex: 9999,
            boxShadow: "0 16px 48px rgba(0,0,0,0.7)",
            overflow: "hidden",
          }}
        >
          {hits.map((hit, i) => (
            <DropdownRow
              key={hit.id}
              hit={hit}
              query={input}
              active={cursor === i}
              onMouseEnter={() => setCursor(i)}
              onClick={() => {
                setOpen(false);
                router.push(`/browse/${hit.slug}`);
              }}
            />
          ))}

          {/* "See all results" footer */}
          <button
            onClick={() => {
              setOpen(false);
              router.push(`/search?q=${encodeURIComponent(input)}`);
            }}
            style={{
              display: "block",
              width: "100%",
              padding: "10px 14px",
              background: "#0a0909",
              border: "none",
              borderTop: "1px solid #1a1919",
              color: "#e8621a",
              fontFamily: "var(--font-stencil, monospace)",
              fontSize: 10,
              letterSpacing: "0.15em",
              cursor: "pointer",
              textAlign: "left",
              transition: "background 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "#141313")}
            onMouseLeave={e => (e.currentTarget.style.background = "#0a0909")}
          >
            SEE ALL RESULTS FOR "{input.toUpperCase()}" →
          </button>
        </div>
      )}

      {/* Spinner keyframe */}
      <style>{`@keyframes gs-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Single dropdown row ────────────────────────────────────────────────────────
function DropdownRow({
  hit,
  query,
  active,
  onMouseEnter,
  onClick,
}: {
  hit: SearchHit;
  query: string;
  active: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        cursor: "pointer",
        background: active ? "rgba(232,98,26,0.08)" : "transparent",
        borderBottom: "1px solid #1a1919",
        transition: "background 0.1s",
      }}
    >
      {/* Thumbnail */}
      <div
        style={{
          width: 40,
          height: 40,
          flexShrink: 0,
          background: "#fff",
          borderRadius: 2,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid #2a2828",
        }}
      >
        {hit.image
          ? <img src={hit.image} alt={hit.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <span style={{ fontSize: 7, color: "#8a8784", fontFamily: "monospace" }}>IMG</span>
        }
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: "#f0ebe3",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          lineHeight: 1.3,
        }}>
          {highlightMatch(hit.name, query)}
        </div>
        <div style={{
          fontFamily: "var(--font-stencil, monospace)",
          fontSize: 9,
          color: "#8a8784",
          letterSpacing: "0.1em",
          marginTop: 2,
        }}>
          {hit.brand}
          {hit.category && <span style={{ color: "#3a3838" }}> · {hit.category}</span>}
        </div>
      </div>

      {/* Price + stock */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{
          fontFamily: "var(--font-caesar, sans-serif)",
          fontSize: 16,
          color: "#f0ebe3",
          letterSpacing: "0.04em",
        }}>
          ${hit.price?.toFixed(2) ?? "—"}
        </div>
        {!hit.inStock && (
          <div style={{
            fontFamily: "var(--font-stencil, monospace)",
            fontSize: 8,
            color: "#8a8784",
            letterSpacing: "0.1em",
          }}>
            OOS
          </div>
        )}
      </div>
    </div>
  );
}

// Simple inline highlight
function highlightMatch(text: string, query: string) {
  if (!query || !text) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: "rgba(232,98,26,0.2)", color: "#e8621a", borderRadius: 1, padding: "0 2px" }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}
