import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.parts-unlimited.com",
      },
      {
        protocol: "https",
        hostname: "**.wps-inc.com",
      },
    ],
  },
};

export default nextConfig;
