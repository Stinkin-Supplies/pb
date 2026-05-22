"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

// Debounce helper
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * BrowseSearchBar
 *
 * Drop this at the top of any browse- page.
 *
 * Props:
 *   onSearch(query: string) — called as user types (debounced 250 ms).
 *                             Pass null/undefined to use router-redirect mode instead.
 *   placeholder  — override default placeholder text
 *   initialValue — pre-fill the input (e.g. from URL params)
 *   className    — extra class on outer wrapper
 *
 * Two modes:
 *   1. Inline filter mode  — onSearch prop provided.
 *      The parent browse page receives the query string and filters its own
 *      product grid (e.g. passes `q` to the Typesense query alongside existing
 *      family / category filters).
 *
 *   2. Redirect mode       — no onSearch prop.
 *      Submitting or pressing Enter navigates to /search?q=<query>
 *      (the existing /search page already handles Typesense queries).
 */
export default function BrowseSearchBar({
  onSearch,
  placeholder = "Search parts, OEM numbers, brands…",
  initialValue = "",
  className = "",
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialValue);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);
  const debouncedQuery = useDebounce(query, 250);

  // Inline-filter mode: notify parent whenever debounced value changes
  useEffect(() => {
    if (typeof onSearch === "function") {
      onSearch(debouncedQuery);
    }
  }, [debouncedQuery, onSearch]);

  const handleSubmit = useCallback(
    (e) => {
      e?.preventDefault();
      if (!query.trim()) return;
      if (typeof onSearch !== "function") {
        // Redirect mode
        router.push(`/search?q=${encodeURIComponent(query.trim())}`);
      }
      // In inline mode, debounce already handled it — nothing extra needed
    },
    [query, onSearch, router]
  );

  const handleClear = () => {
    setQuery("");
    if (typeof onSearch === "function") onSearch("");
    inputRef.current?.focus();
  };

  return (
    <div
      className={`browse-search-wrapper ${className}`}
      style={wrapperStyle}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          ...formStyle,
          boxShadow: focused
            ? "0 0 0 2px #0d9488, 0 2px 12px rgba(0,0,0,0.10)"
            : "0 1px 4px rgba(0,0,0,0.08)",
        }}
        role="search"
      >
        {/* Search icon */}
        <span style={iconWrapStyle} aria-hidden="true">
          <SearchIcon />
        </span>

        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          aria-label="Search products"
          autoComplete="off"
          spellCheck="false"
          style={inputStyle}
        />

        {/* Clear button — only when there's text */}
        {query.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search"
            style={clearBtnStyle}
          >
            <ClearIcon />
          </button>
        )}

        {/* Submit button */}
        <button
          type="submit"
          aria-label="Submit search"
          style={submitBtnStyle}
        >
          GO
        </button>
      </form>

      <style>{css}</style>
    </div>
  );
}

// ─── Inline SVG Icons ────────────────────────────────────────────────────────

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="22" y2="22" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const wrapperStyle = {
  width: "100%",
  maxWidth: "720px",
  margin: "0 auto 28px",
  padding: "0 16px",
  boxSizing: "border-box",
};

const formStyle = {
  display: "flex",
  alignItems: "center",
  background: "#ffffff",
  border: "1.5px solid #e2e2e2",
  borderRadius: "10px",
  height: "50px",
  padding: "0 6px 0 14px",
  transition: "box-shadow 0.18s ease, border-color 0.18s ease",
  gap: "4px",
};

const iconWrapStyle = {
  color: "#9ca3af",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  marginRight: "4px",
};

const inputStyle = {
  flex: 1,
  border: "none",
  outline: "none",
  background: "transparent",
  fontSize: "15px",
  fontFamily: "'Barlow Condensed', 'Barlow', sans-serif",
  fontWeight: 500,
  letterSpacing: "0.01em",
  color: "#1a1a1a",
  minWidth: 0,
  // Remove default search-input chrome (webkit clear button etc.)
  WebkitAppearance: "none",
};

const clearBtnStyle = {
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "28px",
  height: "28px",
  border: "none",
  background: "transparent",
  borderRadius: "50%",
  cursor: "pointer",
  color: "#9ca3af",
  padding: 0,
  transition: "background 0.15s, color 0.15s",
};

const submitBtnStyle = {
  flexShrink: 0,
  height: "36px",
  padding: "0 16px",
  background: "#0d9488",       // teal — matches existing palette
  color: "#ffffff",
  border: "none",
  borderRadius: "7px",
  fontFamily: "'Barlow Condensed', 'Barlow', sans-serif",
  fontWeight: 700,
  fontSize: "13px",
  letterSpacing: "0.08em",
  cursor: "pointer",
  transition: "background 0.15s",
};

const css = `
  /* Remove native search-input clear button in Chrome/Safari */
  .browse-search-wrapper input[type="search"]::-webkit-search-decoration,
  .browse-search-wrapper input[type="search"]::-webkit-search-cancel-button,
  .browse-search-wrapper input[type="search"]::-webkit-search-results-button,
  .browse-search-wrapper input[type="search"]::-webkit-search-results-decoration {
    display: none;
  }
  /* Placeholder color */
  .browse-search-wrapper input::placeholder {
    color: #b0b0b0;
    font-weight: 400;
  }
  /* Clear button hover */
  .browse-search-wrapper button[aria-label="Clear search"]:hover {
    background: #f3f4f6;
    color: #374151;
  }
  /* Submit button hover */
  .browse-search-wrapper button[type="submit"]:hover {
    background: #0f766e;
  }
  /* Mobile — reduce side padding a touch */
  @media (max-width: 480px) {
    .browse-search-wrapper {
      padding: 0 12px;
      margin-bottom: 20px;
    }
  }
`;
