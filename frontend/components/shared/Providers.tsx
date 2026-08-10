"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
} from "@solana/kit";
import { solanaConfig } from "@/lib/solana-config";
import { SolanaProgramProvider } from "./SolanaProgramProvider";

const solanaConnectors = toSolanaWalletConnectors({
  shouldAutoConnect: true,
});

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
          logo: "/logo.png",
          walletChainType: "solana-only",
          walletList: [
            "phantom",
            "solflare",
            "backpack",
            "detected_solana_wallets",
            "wallet_connect_qr_solana",
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
          // Make signing/transaction approval visible while this flow is
          // being validated. This can be relaxed once session keys are live.
          showWalletUIs: true,
        },

        // Privy v3 embedded-wallet signing requires Kit RPC clients keyed by
        // the CAIP-2 Solana cluster name. `solanaClusters` was removed in v3.
        solana: {
          rpcs: {
            "solana:devnet": {
              rpc: createSolanaRpc(solanaConfig.rpcEndpoint),
              rpcSubscriptions: createSolanaRpcSubscriptions(
                solanaConfig.rpcWsEndpoint
              ),
              blockExplorerUrl: "https://explorer.solana.com/?cluster=devnet",
            },
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
