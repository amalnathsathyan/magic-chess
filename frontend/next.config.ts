import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Allow images from Solana token metadata and common CDNs
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },

  // Transpile the local SDK package
  transpilePackages: ["@magic-chess/sdk"],

  // Webpack config for local SDK symlink resolution
  webpack: (config) => {
    // Resolve symlinks so local `file:` linked packages work
    config.resolve.symlinks = true;
    // SDK lives outside frontend/ — webpack walks up from real path
    // and misses frontend/node_modules. Add it explicitly.
    config.resolve.modules = [
      ...(config.resolve.modules || []),
      path.resolve(__dirname, "node_modules"),
    ];
    return config;
  },
};

export default nextConfig;
