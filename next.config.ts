import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@whiskeysockets/baileys"],
  images: { unoptimized: true },
  experimental: {
    serverActions: {
      bodySizeLimit: "11mb",
    },
  },
  outputFileTracingIncludes: {
    "/*": ["./drizzle/**/*"],
  },
};

export default nextConfig;
