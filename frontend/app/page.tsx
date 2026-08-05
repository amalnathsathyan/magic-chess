import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { GameModes } from "@/components/landing/GameModes";
import { WhyMagicBlock } from "@/components/landing/WhyMagicBlock";
import { Security } from "@/components/landing/Security";
import { OpenSource } from "@/components/landing/OpenSource";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <Hero />
      <HowItWorks />
      <GameModes />
      <WhyMagicBlock />
      <OpenSource />
      <Security />
      <footer className="border-t border-white/10 bg-black py-12">
        <div className="mx-auto max-w-5xl px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-heading font-bold text-lg text-white">Magic Chess</span>
            <span className="text-sm text-neutral-500">© 2026</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="/docs" className="text-sm text-neutral-400 hover:text-white transition-colors">Documentation</a>
            <a href="https://github.com/amalnathsathyan/magic-chess" target="_blank" rel="noreferrer" className="text-sm text-neutral-400 hover:text-white transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
