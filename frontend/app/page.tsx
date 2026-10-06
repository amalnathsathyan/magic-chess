import { Hero } from "@/components/landing/Hero";
import {
  Builders,
  Footer,
  HowItWorks,
  Modes,
  Principles,
  BrandPromise,
} from "@/components/landing/Sections";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Hero />
      <BrandPromise />
      <HowItWorks />
      <Modes />
      <Principles />
      <Builders />
      <Footer />
    </div>
  );
}
