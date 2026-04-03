import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import CartRoot from "@/components/CartRoot";
import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import "./globals.css";

const fontVariables = {
  // Keep the existing CSS variable contract, but avoid network font fetches during build.
  "--font-caesar": '"Trebuchet MS"',
  "--font-stencil": '"Courier New"',
} as CSSProperties & Record<`--${string}`, string>;

export const metadata: Metadata = {
  title: "Stinkin' Supplies | Powersports Parts & Accessories",
  description:
    "Premium powersports parts for cruisers, choppers, and performance builds.",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" style={fontVariables}>
      <body>
        <CartRoot>
          {children}
          <Analytics />
          <SpeedInsights />
        </CartRoot>
      </body>
    </html>
  );
}
