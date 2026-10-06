import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ZugSymbol } from "@/components/brand/ZugLogo";
import { cn } from "@/lib/utils";

const DOCS_URL = "https://amalnathsathyan.github.io/magic-chess/";
const GITHUB_URL = "https://github.com/amalnathsathyan/magic-chess";

function SectionHeader({ index, title, kicker }: { index: string; title: string; kicker: string }) {
  return (
    <div className="mb-10 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
      <h2 className="font-display text-4xl sm:text-5xl">{title}</h2>
      <span className="label">
        {index} / {kicker}
      </span>
    </div>
  );
}

/** Brand promise: three short lines, three plain explanations. */
export function BrandPromise() {
  const items = [
    {
      title: "Instant play.",
      body: "Moves run on MagicBlock Ephemeral Rollups, so a game feels like a local one. No fees to think about: gas is sponsored.",
    },
    {
      title: "Permanent record.",
      body: "Every move is recorded on-chain and the result settles on Solana. A history no one can edit, replayable by anyone.",
    },
    {
      title: "Fair stakes.",
      body: "Optional stakes are held in program escrow and released by the result — never by us. On devnet, test tokens only.",
    },
  ];
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <SectionHeader index="01" kicker="The promise" title="Consequence." />
        <div className="grid border-l border-t border-border md:grid-cols-3">
          {items.map((item) => (
            <div key={item.title} className="border-b border-r border-border p-6">
              <h3 className="font-heading text-2xl font-extrabold [font-stretch:115%]">{item.title}</h3>
              <p className="mt-3 leading-relaxed text-soft">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HowItWorks() {
  const steps = [
    { move: "1.", title: "Sign in", body: "Email, Google, Discord or a Solana wallet. A wallet is created for you if you need one." },
    { move: "2.", title: "Create or join", body: "Pick a time control and an optional stake. Free games work too." },
    { move: "3.", title: "Play", body: "Moves confirm in milliseconds. The board you see is the board on chain." },
    { move: "4.", title: "Settle and replay", body: "The result releases the escrow. The game joins the public record, move by move." },
  ];
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <SectionHeader index="02" kicker="How it works" title="Zero friction to first move." />
        <ol className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => (
            <li key={step.title} className="bg-background p-6">
              <span className="font-mono text-sm text-primary">{step.move}</span>
              <h3 className="mt-3 font-heading text-lg font-bold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

type Stage = "live" | "preview" | "roadmap" | "open";

const STAGE: Record<Stage, { label: string; className: string }> = {
  live: { label: "Live on devnet", className: "text-success" },
  preview: { label: "Preview · play points", className: "text-accent" },
  roadmap: { label: "Roadmap", className: "text-muted-foreground" },
  open: { label: "Open source", className: "text-success" },
};

/** The ZUG naming architecture, with each product's honest stage. */
export function Modes() {
  const modes: Array<{ tier: string; name: string; stage: Stage; body: string; href?: string }> = [
    {
      tier: "Mode",
      name: "Play",
      stage: "live",
      body: "Quick matches with a 1, 3 or 10 minute move clock. Free or staked, settled on-chain.",
      href: "/arena",
    },
    {
      tier: "Mode",
      name: "Live",
      stage: "live",
      body: "Watch any game in progress, straight from the rollup. Every finished game can be replayed.",
      href: "/arena",
    },
    {
      tier: "Mode",
      name: "Predict",
      stage: "preview",
      body: "Call the next move in a live game with play points. No money involved; real markets only with legal and audit sign-off.",
    },
    {
      tier: "Build",
      name: "SDK",
      stage: "open",
      body: "TypeScript SDK and Anchor program. Create games, submit moves, read state, connect bots.",
      href: GITHUB_URL,
    },
  ];
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <SectionHeader index="03" kicker="ZUG Arena" title="One arena. Plain words." />
        <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
          {modes.map((mode) => {
            const body = (
              <>
                <span className="label">Tier 2 · {mode.tier}</span>
                <p className="mt-3 flex items-baseline gap-2 text-3xl">
                  <span className="font-display">ZUG</span>
                  <span className="font-heading font-normal uppercase [font-stretch:110%]">{mode.name}</span>
                </p>
                <span className={cn("stage-tag mt-3", STAGE[mode.stage].className)}>
                  {STAGE[mode.stage].label}
                </span>
                <p className="mt-4 text-sm leading-relaxed text-soft">{mode.body}</p>
              </>
            );
            return mode.href ? (
              <Link
                key={mode.name}
                href={mode.href}
                className="group bg-background p-6 transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                {body}
              </Link>
            ) : (
              <div key={mode.name} className="bg-background p-6">
                {body}
              </div>
            );
          })}
        </div>
        <div className="mt-px grid gap-px bg-border md:grid-cols-2">
          <div className="bg-background p-6">
            <span className="label">Program · Agents</span>
            <p className="mt-3 flex items-baseline gap-2 text-2xl">
              <span className="font-display">ZUG</span>
              <span className="font-heading font-normal uppercase [font-stretch:110%]">Agents</span>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-soft">
              Bots and AI agents play on the same board, same clock, same record. ZUG doesn&apos;t
              ship an AI; it hosts yours.
            </p>
          </div>
          <div className="bg-background p-6">
            <span className="label">Competition · Roadmap</span>
            <p className="mt-3 flex items-baseline gap-2 text-2xl">
              <span className="font-display">ZUG</span>
              <span className="font-heading font-normal uppercase [font-stretch:110%]">Open / League / Cup</span>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-soft">
              Tournaments and leagues are next. Until they ship, the Ladder ranks every rated
              player by Elo.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Brand principles, numbered as the opening they're named after. */
export function Principles() {
  const principles = [
    ["1.e4", "The board comes first.", "The game is the hero of every screen. Chain, wallet and brand support it."],
    ["2.Nf3", "Show the consequence.", "Every action has a visible result: a highlighted square, a confirmed state, a settled outcome."],
    ["3.Bc4", "Prove, don't claim.", "Link the transaction, open the code, show the state. No “trust us”."],
    ["4.O-O", "Zero friction to first move.", "Social login, sponsored gas, no jargon on the way to the board."],
    ["5.d4", "Earn every pixel.", "Nothing decorative. If an element doesn't inform or decide, cut it."],
    ["6.Re1", "Honest about the clock.", "Devnet is devnet. Roadmap is roadmap. We label stage, always."],
  ];
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <SectionHeader index="04" kicker="Principles" title="Prove, don't claim." />
        <div className="grid gap-px bg-border md:grid-cols-2 lg:grid-cols-3">
          {principles.map(([move, title, body]) => (
            <div key={move} className="bg-background p-6">
              <span className="font-mono text-sm text-primary">{move}</span>
              <h3 className="mt-2 font-heading text-lg font-bold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Builders() {
  return (
    <section className="border-b border-border bg-bone text-graphite">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-16 sm:px-6 md:flex-row md:items-end md:justify-between md:py-20">
        <div className="max-w-2xl">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#5F656E]">
            05 / Open infrastructure
          </span>
          <h2 className="mt-4 font-display text-4xl sm:text-5xl">Fork it. Read it.</h2>
          <p className="mt-2 font-display text-2xl text-primary sm:text-3xl">Build an agent that beats us.</p>
          <p className="mt-6 leading-relaxed text-[#2C3036]">
            Games run in MagicBlock Ephemeral Rollups for low-latency moves and commit state to
            Solana for settlement. The program, SDK and this app are open source.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-12 items-center gap-2 bg-graphite px-6 font-heading text-sm font-bold uppercase tracking-wide text-bone transition-colors hover:bg-[#1F2226] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            ZUG on GitHub
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </a>
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-12 items-center gap-2 border border-graphite px-6 font-heading text-sm font-bold uppercase tracking-wide transition-colors hover:bg-graphite hover:text-bone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            ZUG Docs
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <ZugSymbol className="h-7 w-7" />
        <span className="label">ZUG · Every move matters.</span>
      </div>
      <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
        <Link href="/arena" className="hover:text-foreground">Arena</Link>
        <Link href="/leaderboard" className="hover:text-foreground">Ladder</Link>
        <a href={DOCS_URL} className="hover:text-foreground">Docs</a>
        <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-foreground">GitHub</a>
        <span className="font-mono text-xs">Solana devnet · test tokens only</span>
      </div>
    </footer>
  );
}
