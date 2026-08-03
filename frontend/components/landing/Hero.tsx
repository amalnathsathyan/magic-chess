"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Sword, Coins, Zap } from "lucide-react";

export function Hero() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-24">
      {/* Background gradient orbs */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute right-1/4 top-1/2 h-80 w-80 rounded-full bg-accent/5 blur-[100px]" />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative mx-auto max-w-4xl text-center"
      >
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary"
        >
          <Zap className="h-3.5 w-3.5" />
          Powered by MagicBlock Ephemeral Rollups
        </motion.div>

        {/* Headline */}
        <h1 className="font-heading text-5xl font-bold leading-tight tracking-tight sm:text-6xl lg:text-7xl">
          <span className="text-primary">On-Chain Chess,</span>
          <br />
          Real Stakes.
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
          Play competitive chess on Solana with gasless moves.
          Wager SOL or SPL tokens, settle instantly on-chain via
          MagicBlock Ephemeral Rollups.
        </p>

        {/* CTA Buttons */}
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/arena"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-7 py-3 font-heading text-sm font-semibold text-primary-foreground transition-all hover:bg-primary-hover hover:shadow-glow"
          >
            Enter the Arena
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/arena"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-7 py-3 font-heading text-sm font-semibold text-foreground transition-all hover:border-border-hover hover:bg-card"
          >
            Spectate a Match
          </Link>
        </div>
      </motion.div>

      {/* Stats row */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.5 }}
        className="mt-20 grid grid-cols-1 gap-6 sm:grid-cols-3"
      >
        {[
          {
            icon: Sword,
            label: "Total Matches",
            value: "12,847",
          },
          {
            icon: Coins,
            label: "Total Wagered",
            value: "4,320 SOL",
          },
          {
            icon: Zap,
            label: "Avg. Settlement",
            value: "< 1s",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="glass-card flex items-center gap-4 px-6 py-4"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <stat.icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted">{stat.label}</p>
              <p className="font-mono text-lg font-semibold">{stat.value}</p>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Placeholder for animated chess board */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9, duration: 0.6 }}
        className="mt-20 w-full max-w-md"
      >
        <div className="glass-card flex aspect-square items-center justify-center">
          <p className="text-sm text-muted">
            {/* react-chessboard placeholder — will render live board animation */}
            Animated Chess Board
          </p>
        </div>
      </motion.div>
    </section>
  );
}
