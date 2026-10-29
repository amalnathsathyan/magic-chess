import type { Metadata, Viewport } from "next";
import { Archivo, Geist, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/shared/Providers";
import { Header } from "@/components/shared/Header";
import { Toaster } from "sonner";
import "@/app/globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains",
  display: "swap",
});

const DESCRIPTION =
  "Put a stake on a game of chess. The winner takes the pot. Every move is recorded on Solana. Live on devnet.";

export const metadata: Metadata = {
  metadataBase: new URL("https://playzug.xyz"),
  title: {
    default: "ZUG Arena — Every move matters.",
    template: "%s · ZUG Arena",
  },
  description: DESCRIPTION,
  applicationName: "ZUG Arena",
  keywords: ["chess", "competitive chess", "solana", "on-chain", "magicblock", "ZUG"],
  icons: {
    icon: [
      { url: "/brand/zug-icon.svg", type: "image/svg+xml" },
      { url: "/brand/zug-icon-32.png", sizes: "32x32", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/brand/zug-icon-180.png",
  },
  openGraph: {
    title: "ZUG — Every move matters.",
    description: "Real-time competitive chess, recorded move by move on Solana.",
    siteName: "ZUG",
    type: "website",
    images: [{ url: "/brand/zug-og.png", width: 1200, height: 630, alt: "ZUG" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ZUG — Every move matters.",
    description: "Real-time competitive chess, recorded move by move on Solana.",
    images: ["/brand/zug-og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0D0E10",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${geist.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col bg-background font-body text-foreground antialiased pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0">
        <Providers>
          <Header />
          <main id="main" className="flex-1 overflow-x-clip">
            {children}
          </main>
        </Providers>
        <Toaster
          position="bottom-right"
          mobileOffset={{ bottom: "calc(76px + env(safe-area-inset-bottom))" }}
          toastOptions={{
            style: {
              background: "#141619",
              color: "#ECE8DF",
              border: "1px solid #25292E",
              borderRadius: 0,
              fontFamily: "var(--font-geist)",
            },
          }}
        />
      </body>
    </html>
  );
}
