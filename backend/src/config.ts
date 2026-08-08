import "dotenv/config";

// ponytail: single config object, no zod/validation lib — validate at startup

const required = (key: string): string => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
};

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",

  db: {
    url: required("DATABASE_URL"),
  },

  supabase: {
    url: process.env.SUPABASE_URL || "",
    anonKey: process.env.SUPABASE_ANON_KEY || "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  },

  solana: {
    rpcEndpoint:
      process.env.RPC_ENDPOINT || "https://api.devnet.solana.com",
    programId:
      process.env.PROGRAM_ID ||
      "FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h",
  },
} as const;
