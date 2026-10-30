import type { MetadataRoute } from "next";

// Required for `output: "export"`.
export const dynamic = "force-static";

// Served at /manifest.webmanifest. Makes ZUG Arena installable ("Add to Home
// Screen") on Android/Chrome and iOS Safari. Icons live in public/brand/.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ZUG Arena",
    short_name: "ZUG",
    description:
      "Put a stake on a game of chess. The winner takes the pot. Every move is recorded on Solana.",
    id: "/arena",
    start_url: "/arena",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#0d0e10",
    theme_color: "#0d0e10",
    lang: "en",
    categories: ["games", "entertainment"],
    icons: [
      { src: "/brand/zug-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/zug-icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/brand/zug-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Arena", short_name: "Arena", url: "/arena", description: "Open matches" },
      { name: "Ladder", short_name: "Ladder", url: "/leaderboard", description: "Ratings and XP" },
    ],
  };
}
