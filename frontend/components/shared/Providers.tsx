"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { Provider as JotaiProvider } from "jotai";

function PrivyAuthProvider({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    // Render children without Privy when no app ID is configured (dev mode)
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        // Max coverage login methods for chess + crypto audience
        loginMethods: ["email", "google", "wallet", "discord"],

        appearance: {
          theme: "dark",
          accentColor: "#00e676",
          logo: "/logo.svg",
        },

        embeddedWallets: {
          createOnLogin: "users-without-wallets",
          // Auto-create Solana embedded wallet on login
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
    <JotaiProvider>
      <PrivyAuthProvider>{children}</PrivyAuthProvider>
    </JotaiProvider>
  );
}
