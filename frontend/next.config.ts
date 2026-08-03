import type { NextConfig } from "next";

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
    return config;
  },
};

export default nextConfig;
