import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProductionBuild = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  // Cloudflare serves the production build as static assets. Keeping export
  // mode out of `next dev` allows arbitrary on-chain match IDs to resolve
  // locally instead of requiring every ID in generateStaticParams().
  output: isProductionBuild ? "export" : undefined,

  reactStrictMode: true,

  // Allow images from Solana token metadata and common CDNs
  images: {
    unoptimized: true,
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
