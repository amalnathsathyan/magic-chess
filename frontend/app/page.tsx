import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { GameModes } from "@/components/landing/GameModes";
import { WhyMagicBlock } from "@/components/landing/WhyMagicBlock";
import { Security } from "@/components/landing/Security";

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <Hero />
      <HowItWorks />
      <GameModes />
      <WhyMagicBlock />
      <Security />
    </main>
  );
}
