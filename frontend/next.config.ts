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
    // SDK files live outside frontend/. Webpack resolves from real path
    // (../sdk/) and misses frontend/node_modules. Alias explicitly.
    const frontendNodeModules = path.resolve(__dirname, "node_modules");
    config.resolve.alias = {
      ...config.resolve.alias,
      "@solana/web3.js": path.resolve(frontendNodeModules, "@solana/web3.js"),
      "@solana/spl-token": path.resolve(frontendNodeModules, "@solana/spl-token"),
    };
    return config;
  },
};

export default nextConfig;
