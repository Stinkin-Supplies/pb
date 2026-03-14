// app/layout.jsx
// Root layout — server component.
// CartProvider and CartDrawer are client components loaded here
// so cart state is available on every page.

import "./globals.css";
import CartRoot from "@/components/CartRoot";

export const metadata = {
  title:       "Stinkin' Supplies | Powersports Parts & Accessories",
  description: "Premium powersports parts for cruisers, choppers, and performance builds.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/>
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Condensed:wght@400;500;600;700&family=Share+Tech+Mono&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <CartRoot>{children}</CartRoot>
      </body>
    </html>
  );
}
