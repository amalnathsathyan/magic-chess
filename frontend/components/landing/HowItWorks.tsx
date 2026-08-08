"use client";

import { motion } from "framer-motion";
import { PlusCircle, Zap, Trophy } from "lucide-react";

const steps = [
  {
    icon: PlusCircle,
    title: "Create Match",
    description:
      "Choose a per-move timer and wager. The configured SPL token is locked in a program-controlled escrow.",
  },
  {
    icon: Zap,
    title: "Play on the ER",
    description:
      "After both players join, the match account is delegated to MagicBlock for low-latency, on-chain move execution.",
  },
  {
    icon: Trophy,
    title: "Commit & Settle",
    description:
      "A player commits the final game state back to Solana, then submits the program-verified escrow payout.",
  },
];

export function HowItWorks() {
  return (
    <section className="px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-16 text-center"
        >
          <h2 className="font-heading text-3xl font-bold sm:text-4xl text-foreground">
            How It Works
          </h2>
          <p className="mt-3 font-body text-muted-foreground">
            From creation to victory in three simple steps
          </p>
        </motion.div>

        <div className="grid gap-8 md:grid-cols-3">
          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              whileHover={{ y: -5, boxShadow: "var(--shadow-glow)" }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
              className="glass-card relative p-6 transition-all"
            >
              <span className="absolute right-4 top-4 font-mono text-xs text-muted-foreground">
                0{i + 1}
              </span>
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <step.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-heading text-xl font-semibold text-foreground">
                {step.title}
              </h3>
              <p className="mt-3 font-body text-sm text-muted-foreground leading-relaxed">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
