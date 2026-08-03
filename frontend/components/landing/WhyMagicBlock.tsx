"use client";

import { motion } from "framer-motion";
import { Zap, Shield, DollarSign, Cpu } from "lucide-react";

const benefits = [
  {
    icon: Zap,
    title: "Gasless Moves",
    description:
      "Every chess move is submitted on-chain with zero gas fees. MagicBlock Ephemeral Rollups make this possible.",
  },
  {
    icon: Shield,
    title: "Provably Fair",
    description:
      "All game state is verified on Solana. No server-side tampering, no hidden game logic — everything is on-chain.",
  },
  {
    icon: DollarSign,
    title: "Instant Settlement",
    description:
      "Wagers settle the moment checkmate is delivered. No waiting for confirmations — just pure, instant payouts.",
  },
  {
    icon: Cpu,
    title: "Full Composability",
    description:
      "Magic Chess is a fully on-chain protocol. Anyone can build on it, integrate with it, or fork it.",
  },
];

export function WhyMagicBlock() {
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
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
            <Zap className="h-3.5 w-3.5" />
            Why MagicBlock
          </div>
          <h2 className="font-heading text-3xl font-bold sm:text-4xl">
            The Future of On-Chain Gaming
          </h2>
          <p className="mt-3 text-muted-foreground">
            MagicBlock Ephemeral Rollups deliver gasless, instant, provably fair gameplay
          </p>
        </motion.div>

        <div className="grid gap-8 sm:grid-cols-2">
          {benefits.map((benefit, i) => (
            <motion.div
              key={benefit.title}
              initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
              className="flex gap-4"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <benefit.icon className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-heading text-lg font-semibold">
                  {benefit.title}
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {benefit.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
