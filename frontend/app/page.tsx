import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { GameModes } from "@/components/landing/GameModes";
import { WhyMagicBlock } from "@/components/landing/WhyMagicBlock";
import { Security } from "@/components/landing/Security";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <Hero />
      {/* We can keep the rest of the sections, assuming they inherit styling or can act as secondary info */}
      <HowItWorks />
      <GameModes />
      <WhyMagicBlock />
      <Security />
    </main>
  );
}
