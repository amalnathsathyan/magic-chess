import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ZugSymbol } from "@/components/brand/ZugLogo";

const DOCS_URL = "https://docs.playzug.xyz/";
const GITHUB_URL = "https://github.com/amalnathsathyan/magic-chess";
const X_URL = "https://x.com/zugxyz";

/** A game, start to payout. These are real steps, so they're numbered. */
export function HowItWorks() {
  const steps = [
    { title: "Put a stake", body: "Pick a stake and a move clock, or play for free." },
    { title: "Play", body: "Moves land in milliseconds on a MagicBlock rollup. No gas to pay." },
    { title: "Winner takes the pot", body: "The result releases the escrow on Solana. No one else can touch it." },
  ];
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-28">
        <h2 className="font-display text-4xl sm:text-5xl">How a game works</h2>
        <ol className="mt-12 grid gap-px border border-border bg-border md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="bg-background p-6 md:p-8">
              <span className="font-heading text-5xl font-black text-primary [font-stretch:125%]">
                {index + 1}
              </span>
              <h3 className="mt-6 text-xl font-semibold">{step.title}</h3>
              <p className="mt-2 max-w-xs leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** What else lives in the arena: spectating with predictions, and the SDK. */
export function Modes() {
  return (
    <section className="border-b border-border">
      <div className="grid gap-px bg-border md:grid-cols-2">
        <Link
          href="/arena#live-games-heading"
          className="group bg-background px-4 py-14 transition-colors hover:bg-card sm:px-6 md:py-20 md:pr-14 md:pl-[max(1.5rem,calc((100vw-80rem)/2+1.5rem))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        >
          <h2 className="font-display text-3xl sm:text-4xl">Watch and predict</h2>
          <p className="mt-4 max-w-sm leading-relaxed text-muted-foreground">
            Follow any live game and call the next move with play points.
          </p>
          <span className="mt-8 inline-block text-sm font-semibold text-primary group-hover:underline">
            See live games
          </span>
        </Link>
        <div className="bg-bone px-4 py-14 text-graphite sm:px-6 md:py-20 md:pl-14">
          <h2 className="font-display text-3xl sm:text-4xl">Build on ZUG</h2>
          <p className="mt-4 max-w-sm leading-relaxed text-[#2C3036]">
            The program, the TypeScript SDK and this app are open source. Bring a bot or an agent.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="btn bg-graphite text-bone hover:bg-[#1F2226]"
            >
              GitHub
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="btn border border-graphite hover:bg-graphite hover:text-bone"
            >
              Docs
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <ZugSymbol className="h-6 w-6 text-foreground" />
        Every move matters.
      </div>
      <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
        <Link href="/arena" className="hover:text-foreground">Play</Link>
        <Link href="/leaderboard" className="hover:text-foreground">Ladder</Link>
        <a href={DOCS_URL} className="hover:text-foreground">Docs</a>
        <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-foreground">GitHub</a>
        <a href={X_URL} target="_blank" rel="noreferrer" className="hover:text-foreground">X</a>
        <a href="mailto:team@playzug.xyz" className="hover:text-foreground">team@playzug.xyz</a>
      </nav>
    </footer>
  );
}
