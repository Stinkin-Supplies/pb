import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  webpack(config) {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@vercel/speed-insights/next": path.resolve(
        __dirname,
        "lib/stubs/speed-insights-next"
      ),
    };
    return config;
  },
};

export default nextConfig;
