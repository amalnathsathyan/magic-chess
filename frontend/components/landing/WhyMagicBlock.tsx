"use client";

import { motion } from "framer-motion";
import { Zap, Clock, Key, Shield } from "lucide-react";

export function WhyMagicBlock() {
  const features = [
    {
      icon: Zap,
      title: "Zero Gas Fees",
      description: "Play without transaction costs. Ephemeral Rollups process every move without debiting your wallet.",
    },
    {
      icon: Clock,
      title: "50ms Latency",
      description: "Experience ultra-fast, seamless gameplay that matches traditional Web2 servers.",
    },
    {
      icon: Key,
      title: "Session Keys",
      description: "Sign one transaction to start. Our on-chain session keys auto-approve all your moves in the background.",
    },
    {
      icon: Shield,
      title: "Trustless & Verifiable",
      description: "Complete trustless model vs standard platforms. Anyone can create, join, and predict with logic verified on-chain.",
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
