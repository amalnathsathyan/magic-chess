"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Play, Code2, Zap, BookOpen, Eye, PlusCircle } from "lucide-react";

export function Hero() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-start bg-black px-4 pt-32 pb-24 overflow-hidden">
      {/* Animated Motion Background (CSS) */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-1/4 left-1/4 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-[120px] animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-1/4 right-1/4 h-[500px] w-[500px] translate-x-1/3 translate-y-1/3 rounded-full bg-accent/10 blur-[150px] animate-pulse" style={{ animationDuration: '6s' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 mx-auto max-w-5xl text-center flex flex-col items-center"
      >
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary shadow-[0_0_15px_rgba(0,230,118,0.15)]">
          <Zap className="h-4 w-4" />
          The First Prediction-Enabled Chess Platform
        </div>

        <h1 className="font-heading text-6xl font-extrabold tracking-tight text-white sm:text-7xl lg:text-[5.5rem] leading-[1.1] drop-shadow-2xl">
          Every Move <br />On-Chain.
        </h1>
        
        <p className="mt-8 max-w-2xl text-xl text-neutral-400 font-medium leading-relaxed">
          Create, Join, and Predict—three core ways to engage with the premier Web3 chess arena. Experience elegant, lightning-fast gameplay powered by Ephemeral Rollups.
        </p>

        {/* Primary CTAs */}
        <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:justify-center w-full max-w-md sm:max-w-none">
          <Link
            href="/arena"
            className="group flex h-14 items-center justify-center gap-3 rounded-full bg-white px-8 text-base font-semibold text-black transition-all hover:scale-105 hover:bg-neutral-200 shadow-xl"
          >
            <Play className="h-5 w-5 fill-black" />
            Enter Arena
          </Link>
        </div>
        
        <div className="mt-8 flex items-center justify-center gap-6">
          <Link
            href="/docs"
            className="flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            <BookOpen className="h-4 w-4" />
            Documentation
          </Link>
          <span className="text-neutral-800">|</span>
          <Link
            href="https://github.com/amalnathsathyan/magic-chess"
            target="_blank"
            className="flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            <Code2 className="h-4 w-4" />
            Open Source
          </Link>
        </div>
      </motion.div>

      {/* Live & Upcoming Games Section */}
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 mt-24 w-full max-w-6xl px-4"
      >
        <div className="grid gap-8 md:grid-cols-2">
          {/* Live Games (Auto-scrolling simulation) */}
          <div className="glass-card flex flex-col overflow-hidden h-[300px]">
            <div className="border-b border-border bg-black/40 px-6 py-4 flex items-center justify-between">
              <h3 className="font-heading font-semibold text-white">Live Games</h3>
              <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
            </div>
            <div className="flex-1 overflow-hidden relative">
              {/* Scrolling wrapper */}
              <div className="absolute inset-x-0 top-0 flex flex-col gap-3 p-4 animate-scroll">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-card/50 p-4 transition-colors hover:border-primary/50">
                    <div>
                      <div className="font-mono text-sm text-foreground">GM_Magnus vs Hikaru</div>
                      <div className="text-xs text-muted-foreground mt-1">Pool: {15 * i} SOL</div>
                    </div>
                    <button className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20">
                      <Eye className="h-3 w-3" />
                      Watch & Predict
                    </button>
                  </div>
                ))}
              </div>
              {/* Fade masks */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-[rgba(18,18,26,0.6)] to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[rgba(18,18,26,0.6)] to-transparent" />
            </div>
          </div>

          {/* Upcoming Games */}
          <div className="glass-card flex flex-col overflow-hidden h-[300px]">
            <div className="border-b border-border bg-black/40 px-6 py-4 flex items-center justify-between">
              <h3 className="font-heading font-semibold text-white">Open Lobbies</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-card/50 p-4 transition-colors hover:border-primary/50">
                  <div>
                    <div className="font-mono text-sm text-foreground">Waiting for opponent...</div>
                    <div className="text-xs text-accent mt-1">Wager: {0.5 * i} SOL</div>
                  </div>
                  <button className="flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/20">
                    <PlusCircle className="h-3 w-3" />
                    Join Match
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
