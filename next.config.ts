import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["rent.local"],
  // PDFKit 0.20 loads its built-in fonts through package import maps at runtime.
  // Keeping it external preserves that package boundary in standalone desktop
  // builds; bundling it moves createRequire() into a Next.js chunk where the
  // `#standard-fonts/*` imports can no longer be resolved.
  serverExternalPackages: ["@whiskeysockets/baileys", "pdfkit"],
  images: { unoptimized: true },
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
