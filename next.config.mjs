const nextConfig = {
  eslint: {
    dirs: ["src"],
  },
  env: {
    NEXT_PUBLIC_AI_ENABLED: process.env.AI_ENABLED,
    NEXT_PUBLIC_OFFLINE_MODE: process.env.OFFLINE_MODE,
  },
};

export default nextConfig;
