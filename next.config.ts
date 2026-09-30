import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  allowedDevOrigins: ["dev-pc.local"],
  serverExternalPackages: ["better-sqlite3", "pdfkit"],
  outputFileTracingIncludes: { "/*": ["./assets/fonts/**/*", "./node_modules/pdfkit/js/data/**/*"] },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
