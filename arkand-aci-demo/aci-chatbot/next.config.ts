import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Silence root inference warnings by pinning the Turbopack root
  turbopack: {
    root: __dirname,
  },
  // Ignore ESLint errors during production builds to avoid blocking deploys on non-critical lint rules
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
