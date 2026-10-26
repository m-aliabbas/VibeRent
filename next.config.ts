import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["rent.local"],
  // PDFKit 0.20 loads its built-in fonts through package import maps at runtime.
  // Keeping it external preserves that package boundary in standalone desktop
  // builds; bundling it moves createRequire() into a Next.js chunk where the
  // `#standard-fonts/*` imports can no longer be resolved.
  // pg-boss is ESM-only and manages its own pg pool; it is loaded from node_modules as-is.
  serverExternalPackages: ["@whiskeysockets/baileys", "pdfkit", "pg-boss"],
  images: { unoptimized: true },
  // Next's client reference manifest skips a "use client" module that webpack
  // scope-hoists into its route's client entry. On the Linux web build this
  // dropped BookingsWorkspace from /[section], so /bookings failed with
  // "Could not find the module ... in the React Client Manifest".
  webpack: (config, { isServer }) => {
    if (!isServer) config.optimization.concatenateModules = false;
    return config;
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "22mb",
    },
  },
  outputFileTracingIncludes: {
    "/*": [
      "./drizzle/**/*",
      "./node_modules/pdfkit/package.json",
      "./node_modules/pdfkit/js/standard-fonts/**/*",
    ],
  },
};

export default nextConfig;
