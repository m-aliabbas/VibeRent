import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
