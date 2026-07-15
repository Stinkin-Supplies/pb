import { Analytics }     from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import CartRoot     from "@/components/CartRoot";
import Footer       from "@/components/Footer";
import BottomNav    from "@/components/BottomNav";
import NotchNavbar  from "@/components/NotchNavbar";
import { Share_Tech_Mono, Barlow } from "next/font/google";
import localFont from "next/font/local";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

/**
 * ── Font system ──────────────────────────────────────────────────────────────
 *
 * --font-tanker    Tanker Regular        → Primary display: era names, headings,
 *                                          kinetic text, product names, CTAs
 *
 * --font-bespoke   Bespoke Serif Variable  → Editorial / secondary display:
 *                                          section headers, pull quotes, prices.
 *                                          Weights: 300 Light · 400 Regular ·
 *                                          500 Medium · 700 Bold · 800 Extrabold
 *
 * --font-body      Barlow 400–700        → Body text, UI prose, descriptions,
 *                                          readable labels, nav items.
 *                                          Use weight 500 (medium) for body,
 *                                          600 for emphasis, 700 for bold CTAs.
 *
 * --font-stencil   Share Tech Mono       → Technical mono only: SKUs, OEM#s,
 *                                          year codes, hex values, data fields.
 *                                          Keep at 12px+ minimum.
 *
 * --font-caesar    → alias for --font-bespoke (legacy compat)
 * --font-sailor    → alias for --font-tanker   (legacy compat)
 * --font-barlow    → alias for --font-body     (legacy compat)
 * ────────────────────────────────────────────────────────────────────────────
 */

// Tanker — primary display (wide, loud, single weight)
const tanker = localFont({
  src: [{ path: "../public/fonts/Tanker-Regular.ttf", weight: "400", style: "normal" }],
  variable: "--font-tanker",
  display: "swap",
});

// Bespoke Serif Variable — editorial secondary display
// Weight range 300–800: Light · Regular · Medium · Bold · Extrabold
// Use font-weight: 300/400/500/700/800 to access each step
const bespokeSerif = localFont({
  src: [{ path: "../public/fonts/BespokeSerif-Variable.ttf", weight: "300 800", style: "normal" }],
  variable: "--font-bespoke",
  display: "swap",
});

// Share Tech Mono — technical data labels only (SKUs, OEM#, year codes)
const shareTech = Share_Tech_Mono({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-stencil",
  display: "swap",
});

// Barlow — body text, UI prose, readable labels, descriptions
// Loaded with full weight range so bold/semibold work everywhere
const barlow = Barlow({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Stinkin' Supplies | Powersports Parts & Accessories",
  description: "Premium powersports parts for cruisers, choppers, and performance builds.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${tanker.variable} ${bespokeSerif.variable} ${shareTech.variable} ${barlow.variable}`}
    >
      <head>
        <style>{`
          /* Legacy alias vars — keeps old components working without edits */
          :root {
            --font-sailor:  var(--font-tanker);
            --font-caesar:  var(--font-bespoke);
            --font-barlow:  var(--font-body);
          }
        `}</style>
      </head>
      <body>
        <CartRoot>
          <NotchNavbar />
          {children}
          <Footer />
          <BottomNav />
          <Analytics />
          <SpeedInsights />
        </CartRoot>
      </body>
    </html>
  );
}
