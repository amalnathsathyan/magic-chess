"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { SolanaProgramProvider } from "./SolanaProgramProvider";

function AuthConfigurationError() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background px-4 text-foreground">
      <div
        role="alert"
        className="w-full max-w-md rounded-xl border border-destructive/30 bg-card p-6 text-center shadow-card"
      >
        <p className="font-heading text-xl font-bold">
          Authentication is not configured
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Add <code className="font-mono text-foreground">NEXT_PUBLIC_PRIVY_APP_ID</code>{" "}
          to this deployment and rebuild Magic Chess.
        </p>
      </div>
    </div>
  );
}

function PrivyAuthProvider({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const isPlaceholder = !appId || appId.includes("xxx") || appId.includes("your_privy_app_id_here") || appId.trim() === "";

  if (isPlaceholder) {
    // Do not mount any Privy consumers without their provider.
    return <AuthConfigurationError />;
  }

  // At this point we know appId is a valid non-empty string.
  const validAppId = appId as string;

  return (
    <PrivyProvider
      appId={validAppId}
      config={{
        // Max coverage login methods for chess + crypto audience
        loginMethods: ["email", "google", "wallet", "discord"],

        appearance: {
          theme: "dark",
          accentColor: "#00e676",
          logo: "/logo.svg",
          walletChainType: "solana-only",
          walletList: [
            "phantom",
            "solflare",
            "backpack",
            "detected_solana_wallets",
            "wallet_connect_qr",
          ],
        },

        externalWallets: {
          solana: {
            connectors: solanaConnectors,
          },
        },

        embeddedWallets: {
          solana: {
            createOnLogin: "all-users",
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyAuthProvider>
      <SolanaProgramProvider>{children}</SolanaProgramProvider>
    </PrivyAuthProvider>
  );
}
