"use client";

import { motion } from "framer-motion";
import { Code2, Github, BookOpen, Terminal, Layers } from "lucide-react";
import Link from "next/link";

const features = [
  {
    icon: Github,
    title: "100% Open Source",
    description: "Our entire codebase—Smart Contracts, Frontend, and SDK—is open for anyone to inspect, fork, and build upon.",
  },
  {
    icon: Terminal,
    title: "TypeScript SDK",
    description: "A generated-IDL-backed `@magic-chess/sdk` provides React hooks, PDA helpers, account normalization, and authoritative MagicBlock routing.",
  },
  {
    icon: BookOpen,
    title: "Docusaurus Documentation",
    description: "Extensive developer documentation built with Docusaurus, detailing architecture, chess engine logic, state transitions, and ER usage.",
  },
  {
    icon: Layers,
    title: "Extensible Architecture",
    description: "Built on Anchor and Next.js. Ready for advanced modules like ELO ratings, matchmaking backends, and parimutuel prediction markets.",
  },
];

export function OpenSource() {
  return (
    <section className="px-4 py-24 sm:px-6 lg:px-8 border-t border-border/50 bg-card/30">
      <div className="mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-16 text-center"
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
            <Code2 className="h-4 w-4" />
            For Builders
          </div>
          <h2 className="font-heading text-3xl font-bold sm:text-4xl text-foreground">
            Built for the Ecosystem
          </h2>
          <p className="mt-3 font-body text-muted-foreground max-w-2xl mx-auto">
            Magic Chess isn't just a game. It's a robust, open-source reference implementation for high-performance on-chain applications using Ephemeral Rollups.
          </p>
        </motion.div>

        <div className="grid gap-6 sm:grid-cols-2">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
              className="glass-card p-6 flex items-start gap-4"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <feature.icon className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-heading text-xl font-bold text-foreground mb-2">
                  {feature.title}
                </h3>
                <p className="font-body text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link
            href="https://github.com/amalnathsathyan/magic-chess"
            target="_blank"
            className="group flex h-12 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-black transition-all hover:scale-105 hover:bg-neutral-200"
          >
            <Github className="h-4 w-4 fill-black" />
            View on GitHub
          </Link>
          <Link
            href="https://github.com/amalnathsathyan/magic-chess/tree/main/docs"
            target="_blank"
            className="group flex h-12 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-6 text-sm font-semibold text-white backdrop-blur-md transition-all hover:bg-white/10"
          >
            <BookOpen className="h-4 w-4" />
            Read Documentation
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
