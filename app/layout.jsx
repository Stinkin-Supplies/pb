// app/layout.jsx
// Root layout — runs on every page.
// Fonts loaded here via <link> so they're available globally.
// globals.css sets base resets and CSS variables.

import "./globals.css";

export const metadata = {
  title:       "Stinkin' Supplies | Powersports Parts & Accessories",
  description: "Premium powersports parts for cruisers, choppers, and performance builds.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Google Fonts — must be in <head>, not in a <style> tag */}
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/>
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Condensed:wght@400;500;600;700&family=Share+Tech+Mono&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
