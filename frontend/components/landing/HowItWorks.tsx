"use client";

import { motion } from "framer-motion";
import { Wallet, Gamepad2, CheckCircle, ArrowRight } from "lucide-react";

const steps = [
  {
    icon: Wallet,
    title: "Connect Wallet",
    description:
      "Link your Solana wallet via Privy. One-click sign-in with email or social, plus embedded wallet creation.",
  },
  {
    icon: Gamepad2,
    title: "Join or Create a Match",
    description:
      "Browse open matches in the Arena or create your own. Set wager amount, time control, and challenge opponents.",
  },
  {
    icon: ArrowRight,
    title: "Play Chess",
    description:
      "Make moves on the interactive chess board. Every move is submitted on-chain via MagicBlock with zero gas fees.",
  },
  {
    icon: CheckCircle,
    title: "Settle Instantly",
    description:
      "Winner claims the wager automatically. All game state verified on-chain with cryptographic proof of fair play.",
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
          <h2 className="font-heading text-3xl font-bold sm:text-4xl">
            How It Works
          </h2>
          <p className="mt-3 text-muted-foreground">
            From wallet to checkmate in four simple steps
          </p>
        </motion.div>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
              className="glass-card relative p-6"
            >
              <span className="absolute right-4 top-4 font-mono text-xs text-muted">
                0{i + 1}
              </span>
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <step.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-heading text-lg font-semibold">
                {step.title}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
