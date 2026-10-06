import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ZugSymbol, ZugWordmark } from "@/components/brand/ZugLogo";

const FILES = "abcdefgh";

/** The Leap on its board: g1 and f3 lit, every other square quiet. */
function LeapBoard() {
  const cells = [];
  for (let rank = 8; rank >= 1; rank--) {
    for (let file = 0; file < 8; file++) {
      const square = `${FILES[file]}${rank}`;
      const hot = square === "g1" || square === "f3";
      const dark = (rank + file) % 2 === 0;
      cells.push(
        <div
          key={square}
          className="relative border-b border-r border-[#1F2226]"
          style={{ background: hot ? "rgba(255,79,26,0.12)" : dark ? "#141619" : "#16181B" }}
        >
          <span className="absolute left-1.5 top-1 font-mono text-[9px] text-[#3A3F46]">{square}</span>
        </div>
      );
    }
  }
  return (
    <div className="relative aspect-square w-full bg-card">
      <div className="absolute inset-0 grid grid-cols-8 grid-rows-8">{cells}</div>
      <div className="absolute inset-0 flex items-center justify-center">
        <ZugSymbol className="h-1/2 w-1/2" />
      </div>
      <span className="label absolute bottom-3 right-4">N g1–f3 · The Leap</span>
    </div>
  );
}

export function Hero() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-2 lg:items-center">
        <div className="flex flex-col gap-8">
          <div className="flex items-center justify-between">
            <span className="label">Real-time competitive chess</span>
            <span className="stage-tag text-success">Live on devnet</span>
          </div>
          <h1 className="sr-only">ZUG — Every move matters.</h1>
          <ZugWordmark className="h-auto w-full max-w-[420px] text-foreground" />
          <p className="font-display text-3xl sm:text-4xl" aria-hidden="true">
            Every move matters.
          </p>
          <p className="max-w-lg text-lg leading-relaxed text-soft">
            Fast competitive chess where every move is recorded on-chain. Play instantly with a
            wallet or social login, gas sponsored.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/arena"
              className="inline-flex min-h-12 items-center gap-2 bg-primary px-6 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Play on ZUG
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/arena#recent-games-heading"
              className="inline-flex min-h-12 items-center gap-2 border border-border px-6 font-heading text-sm font-semibold uppercase tracking-wide transition-colors hover:border-border-hover hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Replay recent games
            </Link>
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            Solana devnet · test tokens only · sign in with email, Google, Discord or a wallet
          </p>
        </div>
        <LeapBoard />
      </div>
    </section>
  );
}
