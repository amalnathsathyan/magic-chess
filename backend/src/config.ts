import "dotenv/config";

// ponytail: single config object, no zod/validation lib — validate at startup

const required = (key: string): string => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
};

const nodeEnv = process.env.NODE_ENV || "development";
const port = Number(process.env.PORT || "3001");
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const apiKey = process.env.API_KEY || "dev-api-key-change-in-production";
if (
  nodeEnv === "production" &&
  (!process.env.API_KEY || apiKey === "dev-api-key-change-in-production")
) {
  throw new Error("API_KEY must be set to a non-default value in production");
}

const corsOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (corsOrigins.length === 0) {
  throw new Error("CORS_ORIGIN must contain at least one origin");
}

export const config = {
  port,
  nodeEnv,
  corsOrigins,
  runMigrationsOnStart:
    process.env.RUN_MIGRATIONS_ON_START !== "false",

  db: {
    url: required("DATABASE_URL"),
  },

  solana: {
    rpcEndpoint:
      process.env.RPC_ENDPOINT || "https://api.devnet.solana.com",
    programId:
      process.env.PROGRAM_ID ||
      "FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h",
    routerEndpoint:
      process.env.MAGICBLOCK_ROUTER ||
      "https://devnet-router.magicblock.app/",
    wagerMint:
      process.env.WAGER_MINT ||
      "So11111111111111111111111111111111111111112",
    platformFeeWallet: process.env.PLATFORM_FEE_WALLET || "",
  },

  sponsor: {
    feePayerAddress: process.env.SOLANA_FEE_PAYER_ADDRESS || "",
    feePayerPrivateKey: process.env.SOLANA_FEE_PAYER_PRIVATE_KEY || "",
    privyAppId: process.env.PRIVY_APP_ID || "",
    privyJwtVerificationKey:
      process.env.PRIVY_JWT_VERIFICATION_KEY?.replace(/\\n/g, "\n") || "",
    requestsPerMinute: Number(process.env.SPONSOR_REQUESTS_PER_MINUTE || "10"),
    maxWagerLamports: BigInt(
      process.env.SPONSOR_MAX_WAGER_LAMPORTS || "1000000000"
    ),
  },

  // Shared secret for sync endpoint auth
  apiKey,
} as const;
