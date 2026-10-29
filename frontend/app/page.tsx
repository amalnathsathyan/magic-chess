import { Hero } from "@/components/landing/Hero";
import { Footer, HowItWorks, Modes } from "@/components/landing/Sections";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Hero />
      <HowItWorks />
      <Modes />
      <Footer />
    </div>
  );
}
