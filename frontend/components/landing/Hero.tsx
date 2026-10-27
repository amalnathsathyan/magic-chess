import Link from "next/link";
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
    </div>
  );
}

export function Hero() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 md:py-24 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-20">
        <div className="flex flex-col">
          <h1 className="sr-only">ZUG. Every move matters.</h1>
          <ZugWordmark className="h-auto w-full max-w-[460px] text-foreground" />
          <p className="mt-8 font-display text-4xl sm:text-5xl" aria-hidden="true">
            Every move matters.
          </p>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-soft">
            Put a stake on a game of chess. The winner takes the pot, and every move is
            recorded on Solana.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link href="/arena" className="btn btn-primary min-h-12 px-7 text-[15px]">
              Play now
            </Link>
            <Link href="/arena#live-games-heading" className="btn btn-secondary min-h-12 px-7 text-[15px]">
              Watch live games
            </Link>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">Solana devnet. Test tokens only.</p>
        </div>
        <LeapBoard />
      </div>
    </section>
  );
}
