import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // ── Your own proxy (images served via /api/image-proxy) ──────────────
      // In dev this is localhost; in prod it's your Vercel domain.
      // next/image treats same-origin images as internal, so no entry needed
      // for the proxy route itself — but include your Vercel domain for ISR:
      {
        protocol: "https",
        hostname: "*.vercel.app",     // covers preview + prod deployments
      },
      {
        protocol: "https",
        hostname: "stinksupp.vercel.app",
      },
      // ── WPS CDN (kept here in case you use next/image with the proxy URL) ─
      // The proxy URL is same-origin so next/image won't need this,
      // but keep it if you ever switch to direct URLs later.
      {
        protocol: "https",
        hostname: "cdn.wpsstatic.com",
      },
      {
        protocol: "https",
        hostname: "**.wpsstatic.com",
      },
      // ── Supabase Storage (profile photos, brand logos, etc.) ─────────────
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
      // ── Add PU image CDN here once PIES XML is imported ──────────────────
      // { protocol: "https", hostname: "images.parts-unlimited.com" },
    ],
    // Optional: tell Next.js to also accept webp/avif from the proxy
    formats: ["image/avif", "image/webp"],
    // Bump up if product images are large
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [64, 128, 256, 384, 512],
  },
};

export default nextConfig;
