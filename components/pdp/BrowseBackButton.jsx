"use client";
// ============================================================
// components/pdp/BrowseBackButton.jsx
//
// Drop this near the top of your PDP page.
// Only renders when the user arrived from the browse page via
// ProductQuickViewModal → "View Full Details".
//
// Works by reading "stinkin_browse_return" from sessionStorage,
// which ProductQuickViewModal writes before navigating here.
//
// Usage in PDP:
//   import BrowseBackButton from "@/components/pdp/BrowseBackButton";
//   // near the top of your PDP layout:
//   <BrowseBackButton />
// ============================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const GOLD   = "#b8922a";
const GOLD_B = "rgba(184,146,42,0.25)";
const CREAM2 = "#f2ede4";

const SESSION_KEY = "stinkin_browse_return";

export default function BrowseBackButton({ label = "Browse" }) {
  const [returnUrl, setReturnUrl] = useState(null);
  const router = useRouter();

  useEffect(() => {
    try {
      const url = sessionStorage.getItem(SESSION_KEY);
      if (url) setReturnUrl(url);
    } catch {
      // sessionStorage unavailable (SSR / private mode edge case)
    }
  }, []);

  if (!returnUrl) return null;

  const handleBack = () => {
    // Clear so it doesn't persist across unrelated navigations
    sessionStorage.removeItem(SESSION_KEY);
    router.push(returnUrl);
  };

  return (
    <button
      onClick={handleBack}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: "none",
        border: `1px solid ${GOLD_B}`,
        color: GOLD,
        cursor: "pointer",
        fontFamily: "var(--font-stencil, monospace)",
        fontSize: 9,
        letterSpacing: "2px",
        textTransform: "uppercase",
        padding: "7px 14px",
        transition: "border-color 0.15s, background 0.15s",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = GOLD;
        e.currentTarget.style.background = "rgba(184,146,42,0.06)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = GOLD_B;
        e.currentTarget.style.background = "none";
      }}
    >
      <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
        <path
          d="M5 1L1 5L5 9M1 5H11"
          stroke={GOLD} strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
      {label}
    </button>
  );
}
