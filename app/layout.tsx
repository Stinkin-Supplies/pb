import { Analytics }     from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import CartRoot   from "@/components/CartRoot";
import Footer     from "@/components/Footer";
import BottomNav  from "@/components/BottomNav";
import { Share_Tech_Mono } from "next/font/google";
import localFont from "next/font/local";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

/**
 * ── Font system ──────────────────────────────────────────────────────────────
 *
 * --font-tanker    Tanker Regular        → Primary display: era names, headings,
 *                                          kinetic text, product names, CTAs
 *                                          (replaces New Sailor + Bebas Neue)
 *
 * --font-bespoke   Bespoke Serif Regular → Editorial / secondary display:
 *                                          section headers, pull quotes,
 *                                          price display, tab labels
 *
 * --font-stencil   Share Tech Mono       → UI labels, mono badges, SKUs,
 *                                          year ranges, step indicators,
 *                                          all-caps small text
 *
 * --font-caesar    → alias for --font-bespoke (legacy compat)
 * --font-sailor    → alias for --font-tanker   (legacy compat)
 *
 * Body text: system Barlow via Tailwind / inline styles
 * ────────────────────────────────────────────────────────────────────────────
 */

// Tanker — primary display (wide, loud, single weight)
const tanker = localFont({
  src: [{ path: "../public/fonts/Tanker-Regular.ttf", weight: "400", style: "normal" }],
  variable: "--font-tanker",
  display: "swap",
});

// Bespoke Serif — editorial secondary display
const bespokeSerif = localFont({
  src: [{ path: "../public/fonts/BespokeSerif-Regular.ttf", weight: "400", style: "normal" }],
  variable: "--font-bespoke",
  display: "swap",
});

// Share Tech Mono — UI mono labels
const shareTech = Share_Tech_Mono({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-stencil",
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
      className={`${tanker.variable} ${bespokeSerif.variable} ${shareTech.variable}`}
    >
      <head>
        <style>{`
          /* Legacy alias vars — keeps old components working without edits */
          :root {
            --font-sailor:  var(--font-tanker);
            --font-caesar:  var(--font-bespoke);
            --font-barlow:  'Barlow', 'Barlow Condensed', sans-serif;
          }
        `}</style>
      </head>
      <body>
        <CartRoot>
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
