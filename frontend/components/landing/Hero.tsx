"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Play, Code2, Zap, BookOpen } from "lucide-react";

export function Hero() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-black px-4 py-24">
      {/* Animated Motion Background (CSS) */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-1/4 left-1/4 h-96 w-96 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-primary/20 blur-[120px] motion-reduce:animate-none" style={{ animationDuration: "4s" }} />
        <div className="absolute right-1/4 bottom-1/4 h-[500px] w-[500px] translate-x-1/3 translate-y-1/3 animate-pulse rounded-full bg-accent/10 blur-[150px] motion-reduce:animate-none" style={{ animationDuration: "6s" }} />
      </div>

      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 mx-auto flex max-w-5xl flex-col items-center text-center"
      >
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary shadow-[0_0_15px_rgba(0,230,118,0.15)]">
          <Zap aria-hidden="true" className="h-4 w-4" />
          Realtime chess, verified on Solana
        </div>

        <h1 className="font-heading text-6xl leading-[1.1] font-extrabold tracking-tight text-white drop-shadow-2xl sm:text-7xl lg:text-[5.5rem]">
          Every Move <br />On-Chain.
        </h1>

        <p className="mt-5 font-mono text-xs font-semibold tracking-[0.28em] text-primary/80 uppercase sm:text-sm">
          Create <span aria-hidden="true">·</span> Join <span aria-hidden="true">·</span> Predict
        </p>

        <p className="mt-7 max-w-2xl text-xl leading-relaxed font-medium text-neutral-400">
          Play fast and wager transparently with match state verified on Solana.
          Powered by MagicBlock Ephemeral Rollups.
        </p>

        {/* Primary CTAs */}
        <div className="mt-12 flex w-full max-w-md flex-col gap-4 sm:max-w-none sm:flex-row sm:justify-center">
          <Link
            href="/arena"
            className="group flex h-14 items-center justify-center gap-3 rounded-full bg-white px-8 text-base font-semibold text-black shadow-xl transition-transform hover:scale-105 hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black motion-reduce:hover:scale-100"
          >
            <Play aria-hidden="true" className="h-5 w-5 fill-black" />
            Enter Arena
          </Link>
        </div>
        
        <div className="mt-8 flex items-center justify-center gap-6">
          <Link
            href="https://github.com/amalnathsathyan/magic-chess/tree/main/docs"
            target="_blank"
            rel="noreferrer"
            className="flex min-h-10 items-center gap-2 text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            <BookOpen aria-hidden="true" className="h-4 w-4" />
            Documentation
          </Link>
          <span className="text-neutral-800">|</span>
          <Link
            href="https://github.com/amalnathsathyan/magic-chess"
            target="_blank"
            rel="noreferrer"
            className="flex min-h-10 items-center gap-2 text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            <Code2 aria-hidden="true" className="h-4 w-4" />
            Open Source
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
