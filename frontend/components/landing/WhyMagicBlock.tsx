"use client";

import { motion } from "framer-motion";
import { Zap, Check, X } from "lucide-react";

export function WhyMagicBlock() {
  const comparison = [
    {
      feature: "Transaction Fees",
      standard: "~0.000005 SOL / move",
      magic: "Gasless (0 SOL)",
    },
    {
      feature: "Latency",
      standard: "400ms - 2s",
      magic: "~50ms",
    },
    {
      feature: "Wallet Confirms",
      standard: "1 per move",
      magic: "0 (Session Keys)",
    },
    {
      feature: "State Settlement",
      standard: "Continuous L1 Txns",
      magic: "Ephemeral Rollups",
    }
  ];

  return (
    <section className="px-4 py-24 sm:px-6 lg:px-8">
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
            Why MagicBlock
          </div>
          <h2 className="font-heading text-3xl font-bold sm:text-4xl text-foreground">
            The Future of On-Chain Gaming
          </h2>
          <p className="mt-3 font-body text-muted-foreground">
            MagicBlock Ephemeral Rollups deliver gasless, instant, provably fair gameplay
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="glass-card overflow-hidden"
        >
          <div className="grid grid-cols-3 border-b border-border/50 bg-card/50 p-6 text-sm font-heading font-semibold text-foreground sm:text-lg">
            <div>Feature</div>
            <div className="text-muted-foreground">Standard On-Chain</div>
            <div className="flex items-center gap-2 text-primary">
              <Zap className="h-5 w-5" /> Magic Chess
            </div>
          </div>
          <div className="divide-y divide-border/50">
            {comparison.map((row, i) => (
              <div key={i} className="grid grid-cols-3 p-6 text-sm sm:text-base">
                <div className="font-medium text-foreground">{row.feature}</div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <X className="h-4 w-4 text-destructive" /> {row.standard}
                </div>
                <div className="flex items-center gap-2 text-primary">
                  <Check className="h-4 w-4" /> {row.magic}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
