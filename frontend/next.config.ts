import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig: NextConfig = {
  // OpenNext packages the standalone server output for Cloudflare Workers.
  output: "standalone",
  outputFileTracingRoot: __dirname,

  // SDK has @solana/web3.js as peer dep — tsc can't resolve types from
  // transpiled SDK files. Skip type errors in build; run `tsc --noEmit`
  // separately for real type checking.
  typescript: { ignoreBuildErrors: true },
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
