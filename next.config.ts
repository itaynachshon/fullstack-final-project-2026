import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Product images are hotlinked from Open Food Facts only (cached lookups).
    // Restricting the host here is part of the security posture — see docs/ARCHITECTURE.md §10.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.openfoodfacts.org",
      },
    ],
  },
};

export default nextConfig;
