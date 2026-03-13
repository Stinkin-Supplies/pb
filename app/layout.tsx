import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stinkin Supplies",
  description: "Motorcycle parts and gear",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
