import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import CartRoot from "@/components/CartRoot";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import { Bebas_Neue, Share_Tech_Mono } from "next/font/google";
import localFont from "next/font/local";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const bebas = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-caesar",
  display: "swap",
});

const shareTech = Share_Tech_Mono({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-stencil",
  display: "swap",
});

const newSailor = localFont({
  src: "../public/fonts/New_Sailor.ttf",
  variable: "--font-sailor",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Stinkin' Supplies | Powersports Parts & Accessories",
  description:
    "Premium powersports parts for cruisers, choppers, and performance builds.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${bebas.variable} ${shareTech.variable} ${newSailor.variable}`}>
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
