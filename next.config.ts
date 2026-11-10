import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Header keamanan dasar untuk semua respons (anti clickjacking,
  // anti MIME-sniffing, batasi info referrer).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
