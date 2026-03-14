// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Enable React strict mode for better development warnings
  reactStrictMode: true,

  // Image optimization — add all your image CDN domains
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        pathname: '/v0/b/**',
      },
      // WPS product images
      {
        protocol: 'https',
        hostname: 'cdn.wps-inc.com',
      },
      // Drag Specialties CDN (verify actual hostname with DS)
      {
        protocol: 'https',
        hostname: 'images.dragspecialties.com',
      },
      // Add other vendor image CDNs here
    ],
  },

  // Redirect www to non-www (or vice versa — pick one)
  async redirects() {
    return [
      {
        source: '/',
        has: [{ type: 'host', value: 'www.yourstore.com' }],
        destination: 'https://yourstore.com',
        permanent: true,
      },
    ]
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },

  // Bundle analyzer (run: ANALYZE=true npm run build)
  ...(process.env.ANALYZE === 'true' ? {
    experimental: {
      bundlePagesExternals: true,
    },
  } : {}),
}

export default nextConfig
