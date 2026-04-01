import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import CartRoot from "@/components/CartRoot";
import { Caesar_Dressing, Stardos_Stencil } from "next/font/google";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const caesarDressing = Caesar_Dressing({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-caesar",
});

const stardosStencil = Stardos_Stencil({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-stencil",
});

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
    <html
      lang="en"
      className={`${caesarDressing.variable} ${stardosStencil.variable}`}
    >
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
