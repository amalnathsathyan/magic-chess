"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { Provider as JotaiProvider } from "jotai";

function PrivyAuthProvider({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const isPlaceholder = !appId || appId.includes("xxx") || appId.includes("your_privy_app_id_here") || appId.trim() === "";

  if (isPlaceholder) {
    // Render children without Privy when no app ID is configured (dev mode)
    return <>{children}</>;
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
