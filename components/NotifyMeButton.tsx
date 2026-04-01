"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Props = {
  sku: string;
  productName: string;
  vendor?: "wps" | "pu";
  source?: "pdp" | "cart";
  className?: string;
};

type State = "idle" | "loading" | "done" | "already" | "error" | "unauthenticated";

export default function NotifyMeButton({
  sku,
  productName,
  vendor,
  source = "pdp",
  className,
}: Props) {
  const [state, setState] = useState<State>("idle");
  const supabase = createBrowserSupabaseClient();

  async function handleClick() {
    setState("loading");

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setState("unauthenticated");
      return;
    }

    try {
      const res = await fetch("/api/notifications/restock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_sku: sku,
          product_name: productName,
          vendor,
          source,
        }),
      });

      if (res.ok) {
        setState("done");
      } else if (res.status === 409) {
        setState("already");
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  }

  const base: CSSProperties = {
    width: "100%",
    padding: "14px 24px",
    borderRadius: "2px",
    fontFamily: "var(--font-stencil), sans-serif",
    fontWeight: 600,
    fontSize: "15px",
    letterSpacing: "0.08em",
    cursor: "pointer",
    transition: "all 0.15s",
    border: "1px solid",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
  };

  const styles: Record<State, CSSProperties> = {
    idle: {
      ...base,
      background: "transparent",
      borderColor: "#e8621a",
      color: "#e8621a",
    },
    loading: {
      ...base,
      background: "transparent",
      borderColor: "#8a8784",
      color: "#8a8784",
      cursor: "wait",
    },
    done: {
      ...base,
      background: "rgba(34,197,94,0.1)",
      borderColor: "#22c55e",
      color: "#22c55e",
      cursor: "default",
    },
    already: {
      ...base,
      background: "rgba(34,197,94,0.1)",
      borderColor: "#22c55e",
      color: "#22c55e",
      cursor: "default",
    },
    error: {
      ...base,
      background: "transparent",
      borderColor: "#ef4444",
      color: "#ef4444",
    },
    unauthenticated: {
      ...base,
      background: "transparent",
      borderColor: "#c9a84c",
      color: "#c9a84c",
    },
  };

  const labels: Record<State, string> = {
    idle: "Notify Me When Back in Stock",
    loading: "Saving...",
    done: "We'll Email You When It's Back",
    already: "You're Already on the List",
    error: "Something went wrong - try again",
    unauthenticated: "Sign in to get restock alerts",
  };

  return (
    <button
      style={styles[state]}
      className={className}
      onClick={state === "idle" || state === "error" ? handleClick : undefined}
      disabled={state === "loading" || state === "done" || state === "already"}
    >
      {state === "loading" && (
        <span
          style={{
            width: 14,
            height: 14,
            border: "2px solid #8a8784",
            borderTopColor: "transparent",
            borderRadius: "50%",
            display: "inline-block",
            animation: "spin 0.6s linear infinite",
          }}
        />
      )}
      {labels[state]}
    </button>
  );
}
