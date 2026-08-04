"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Play, Bot, Code2 } from "lucide-react";

export function Hero() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center bg-black px-4 pt-32 pb-16 overflow-hidden">
      {/* Subtle background glow */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[600px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-[100%] bg-white/[0.02] blur-[80px]" />

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 mx-auto max-w-5xl text-center flex flex-col items-center"
      >
        <h1 className="font-heading text-6xl font-bold tracking-tight text-white sm:text-7xl lg:text-[5.5rem] leading-[1.1]">
          Every Move <br />On-Chain.
        </h1>
        
        <p className="mt-8 max-w-2xl text-xl text-neutral-400 font-medium">
          Wager and win in a completely trustless model. Experience elegant, lightning-fast chess powered by Ephemeral Rollups.
        </p>

        {/* Pill-shaped CTAs */}
        <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:justify-center w-full max-w-md sm:max-w-none">
          <Link
            href="/arena"
            className="group flex h-14 items-center justify-center gap-3 rounded-full bg-white px-8 text-base font-semibold text-black transition-all hover:scale-105 hover:bg-neutral-200"
          >
            <Play className="h-5 w-5 fill-black" />
            Play Online
          </Link>
          <button
            disabled
            className="group relative flex h-14 items-center justify-center gap-3 rounded-full border border-white/10 bg-white/5 px-8 text-base font-semibold text-white/50 backdrop-blur-md cursor-not-allowed"
          >
            <Bot className="h-5 w-5" />
            Play Bots
            <span className="absolute -top-3 -right-3 rounded-full bg-neutral-800 px-2 py-0.5 text-xs font-bold text-neutral-300 border border-neutral-700">
              Coming Soon
            </span>
          </button>
        </div>
        
        <Link
          href="https://github.com/magicblock-labs/magic-chess"
          target="_blank"
          className="mt-6 flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          <Code2 className="h-4 w-4" />
          Builders / SDK
        </Link>
      </motion.div>

      {/* 3D Mockup Graphic Placeholder */}
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 mt-20 w-full max-w-5xl px-4 sm:px-6 lg:px-8"
      >
        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 shadow-2xl">
          {/* Subtle reflection/glare */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none" />
          
          <div className="flex h-full w-full items-center justify-center bg-black/50">
            <span className="text-neutral-500 font-medium">Chess Interface Mockup</span>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
