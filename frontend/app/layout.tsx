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
  "ZUG is fast competitive chess where every move is recorded on-chain. Play instantly with a wallet or social login, gas sponsored. Now live on Solana devnet.";

export const metadata: Metadata = {
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
      <body className="flex min-h-screen flex-col md:flex-row bg-background font-body text-foreground antialiased pb-[72px] md:pb-0">
        <Providers>
          <Header />
          <main className="flex-1 overflow-x-hidden">
            {children}
          </main>
        </Providers>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#16181B",
              color: "#ECE8DF",
              border: "1px solid #2C3036",
              borderRadius: 0,
              fontFamily: "var(--font-geist)",
            },
          }}
        />
      </body>
    </html>
  );
}
