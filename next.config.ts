import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // ── WPS CDN ──────────────────────────────────────────────
      {
        protocol: "https",
        hostname: "cdn.wpsstatic.com",
      },
      {
        protocol: "https",
        hostname: "**.wpsstatic.com",
      },
      {
        protocol: "https",
        hostname: "media.wps-inc.com",
      },
      // ── Parts Unlimited / LeMans CDN ─────────────────────────
      {
        protocol: "https",
        hostname: "asset.lemansnet.com",
      },
      {
        protocol: "https",
        hostname: "**.lemansnet.com",
      },
      // ── Vercel deployments ───────────────────────────────────
      {
        protocol: "https",
        hostname: "*.vercel.app",
      },
      {
        protocol: "https",
        hostname: "stinksupp.vercel.app",
      },
      // ── Supabase Storage ─────────────────────────────────────
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
    localPatterns: [
      { pathname: "/api/img" },
      { pathname: "/api/image-proxy" },
    ],
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [64, 128, 256, 384, 512],
  },
};

export default nextConfig;
