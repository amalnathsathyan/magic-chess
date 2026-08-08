"use client";

import { motion } from "framer-motion";
import { Zap, Clock, Route, Shield } from "lucide-react";

export function WhyMagicBlock() {
  const features = [
    {
      icon: Zap,
      title: "Efficient Execution",
      description: "The delegated match account executes on a MagicBlock Ephemeral Rollup, keeping repeated gameplay transactions lightweight.",
    },
    {
      icon: Clock,
      title: "Low-Latency Play",
      description: "Moves use the match account's authoritative ER endpoint while the base layer remains the source of settlement truth.",
    },
    {
      icon: Route,
      title: "Authoritative Routing",
      description: "The client verifies account ownership, resolves the assigned rollup, and refuses unsafe base-layer fallbacks.",
    },
    {
      icon: Shield,
      title: "Trustless & Verifiable",
      description: "Match creation, escrow, chess rules, moves, results, and payouts are enforced by the deployed Solana program.",
    }
  ];

  return (
    <section className="px-4 py-24 sm:px-6 lg:px-8 border-t border-border/50">
      <div className="mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-12 text-center"
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
            <Zap className="h-3.5 w-3.5" />
            Powered by MagicBlock
          </div>
          <h2 className="font-heading text-3xl font-bold sm:text-4xl text-foreground">
            The Future of On-Chain Gaming
          </h2>
          <p className="mt-3 font-body text-muted-foreground">
            Seamlessly blending Web3 security with Web2 performance
          </p>
        </motion.div>

        <div className="grid gap-6 sm:grid-cols-2">
          {features.map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className="glass-card p-6 flex items-start gap-4"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <feature.icon className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-heading text-xl font-semibold text-foreground mb-2">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
