"use client";

/**
 * GlowButton — Primary CTA button
 *
 * Adapted from a CSS edge-glow technique. Recolored from white neon
 * to warm brass gold to match the factory documentation aesthetic.
 *
 * The glowing edges simulate light catching a machined brass plate.
 * The dotted screen texture on hover references vintage halftone printing.
 *
 * The SVG filter (id="glow-unopaq") is rendered once in app/layout.tsx.
 * Do not add it here — it only needs to exist once per page.
 *
 * Props:
 *   children   — button label (default "Add to Cart")
 *   onClick    — click handler
 *   type       — button type (default "button")
 *   disabled   — disabled state
 *   size       — "sm" | "md" | "lg" (default "md")
 *   variant    — "gold" | "steel" | "ghost-glow" (default "gold")
 *   fullWidth  — stretch to container width
 *   className  — extra class names on the outer wrapper
 *   style      — extra styles on the outer wrapper
 */

const SIZES = {
  sm: { height: 36, padding: "0 18px", fontSize: "0.60rem",  letterSpacing: "0.20em" },
  md: { height: 48, padding: "0 28px", fontSize: "0.688rem", letterSpacing: "0.22em" },
  lg: { height: 58, padding: "0 40px", fontSize: "0.813rem", letterSpacing: "0.22em" },
};

// Gold channel values used in the CSS gradient — factored out for the two variants
const GOLD_STOPS = `
  rgba(197,167,34,0)   0%,
  rgba(197,167,34,0.18) var(--s),
  rgba(197,167,34,0.70) var(--s),
  rgba(197,167,34,1)   50%,
  rgba(197,167,34,0.70) var(--e),
  rgba(197,167,34,0.18) var(--e),
  rgba(197,167,34,0)   100%
`;

const STEEL_STOPS = `
  rgba(160,152,144,0)   0%,
  rgba(160,152,144,0.15) var(--s),
  rgba(160,152,144,0.55) var(--s),
  rgba(160,152,144,0.85) 50%,
  rgba(160,152,144,0.55) var(--e),
  rgba(160,152,144,0.15) var(--e),
  rgba(160,152,144,0)   100%
`;

export default function GlowButton({
  children = "Add to Cart",
  onClick,
  type = "button",
  disabled = false,
  size = "md",
  variant = "gold",
  fullWidth = false,
  className = "",
  style = {},
}) {
  const sz = SIZES[size] ?? SIZES.md;
  const stops = variant === "steel" ? STEEL_STOPS : GOLD_STOPS;

  // Hover overlay radial color — subtle warm glow inside the button on hover
  const hoverRadial =
    variant === "ghost-glow"
      ? "rgba(197,167,34,0.08)"
      : variant === "steel"
      ? "rgba(160,152,144,0.12)"
      : "rgba(197,167,34,0.12)";

  const id = `glowbtn-${variant}`;

  return (
    <div
      className={`glow-btn-root ${className}`}
      style={{ position: "relative", display: fullWidth ? "block" : "inline-block", ...style }}
    >
      <style>{`
        /* ── Backdrop — covers the whole page behind the button to clip
           the dotted overlay pattern outside the button area            ── */
        .${id}-backdrop {
          position: absolute;
          inset: -9900%;
          background: radial-gradient(
            circle at 50% 50%,
            transparent 0%,
            transparent 20%,
            rgba(15,14,13,0.70) 50%
          );
          background-size: 3px 3px;
          z-index: -1;
          pointer-events: none;
        }

        /* ── Button shell ────────────────────────────────────────────── */
        .${id} {
          position: relative;
          cursor: pointer;
          border: none;
          width: ${fullWidth ? "100%" : "auto"};
          height: ${sz.height}px;
          padding: ${sz.padding};
          background: ${variant === "ghost-glow" ? "transparent" : "var(--iron)"};
          color: ${variant === "gold" ? "var(--gold)" : variant === "ghost-glow" ? "var(--chrome)" : "var(--silver)"};
          font-family: var(--font-stencil), monospace;
          font-size: ${sz.fontSize};
          letter-spacing: ${sz.letterSpacing};
          text-transform: uppercase;
          transition: color 0.2s ease;
          outline: none;
        }

        .${id}:disabled {
          opacity: 0.35;
          cursor: not-allowed;
          pointer-events: none;
        }

        /* Hover — text brightens to cream */
        .${id}:not(:disabled):hover {
          color: ${variant === "ghost-glow" ? "var(--gold)" : "var(--cream-light)"};
        }

        /* ── Inner text — sits above everything via z-index ────────── */
        .${id}-text {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          white-space: nowrap;
        }

        /* ── Dotted halftone texture + radial highlight on hover ───── */
        .${id}::before {
          content: "";
          position: absolute;
          inset: 0;
          opacity: 0;
          background:
            radial-gradient(
              circle at 50% 50%,
              transparent 0%,
              transparent 20%,
              rgba(15,14,13,0.60) 50%
            ),
            radial-gradient(ellipse 100% 100%, ${hoverRadial}, transparent);
          background-size: 3px 3px, auto auto;
          transition: opacity 0.25s ease;
          pointer-events: none;
          z-index: 0;
        }

        .${id}:not(:disabled):hover::before {
          opacity: 1;
        }

        /* ── Edge glow elements ─────────────────────────────────────── */
        .${id}-edge {
          pointer-events: none;
          position: absolute;
          --w: 2px;
          --t: -36px;
          --s: calc(var(--t) * -1);
          --e: calc(100% + var(--t));
        }

        /* Tight blur — always visible, creates the sharp edge line */
        .${id}-edge::before {
          content: "";
          position: absolute;
          inset: 0;
          background: inherit;
          filter: blur(3px) url(#glow-unopaq);
          z-index: -2;
        }

        /* Wide bloom — appears on hover, creates the brass-catching-light flare */
        .${id}-edge::after {
          content: "";
          position: absolute;
          inset: 0;
          background: inherit;
          filter: blur(10px) url(#glow-unopaq);
          opacity: 0;
          z-index: -2;
          transition: opacity 0.25s ease;
        }

        .${id}:not(:disabled):hover .${id}-edge::after {
          opacity: 1;
        }

        /* Left edge */
        .${id}-edge-l {
          left: -2px;
          background: linear-gradient(${stops});
          top: var(--t);
          bottom: var(--t);
          width: var(--w);
        }

        /* Right edge */
        .${id}-edge-r {
          right: -2px;
          background: linear-gradient(${stops});
          top: var(--t);
          bottom: var(--t);
          width: var(--w);
        }

        /* Top edge */
        .${id}-edge-t {
          top: -2px;
          background: linear-gradient(90deg, ${stops});
          left: var(--t);
          right: var(--t);
          height: var(--w);
        }

        /* Bottom edge */
        .${id}-edge-b {
          bottom: -2px;
          background: linear-gradient(90deg, ${stops});
          left: var(--t);
          right: var(--t);
          height: var(--w);
        }
      `}</style>

      <div className={`${id}-backdrop`} />

      <button
        className={id}
        type={type}
        onClick={onClick}
        disabled={disabled}
      >
        <div className={`${id}-edge ${id}-edge-l`} />
        <div className={`${id}-edge ${id}-edge-r`} />
        <div className={`${id}-edge ${id}-edge-t`} />
        <div className={`${id}-edge ${id}-edge-b`} />
        <span className={`${id}-text`}>{children}</span>
      </button>
    </div>
  );
}
