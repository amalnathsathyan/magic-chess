import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono, DM_Sans } from "next/font/google";
import { Providers } from "@/components/shared/Providers";
import { Header } from "@/components/shared/Header";
import { Toaster } from "sonner";
import "@/app/globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Magic Chess — On-Chain Chess on Solana",
  description:
    "Play chess for real stakes on Solana. Gasless moves powered by MagicBlock Ephemeral Rollups. Wager SOL or SPL tokens in competitive matches.",
  keywords: ["chess", "solana", "magicblock", "on-chain", "wagering", "crypto"],
  openGraph: {
    title: "Magic Chess",
    description: "On-chain chess with wagering on Solana",
    siteName: "Magic Chess",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} ${dmSans.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen flex flex-col bg-background font-body text-foreground antialiased">
        <Providers>
          <Header />
          <main className="flex-1">
            {children}
          </main>
        </Providers>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#12121a",
              color: "#f0f0f5",
              border: "1px solid rgba(255,255,255,0.06)",
            },
          }}
        />
      </body>
    </html>
  );
}
