"use client";

import { motion } from "framer-motion";
import { Swords, Clock, Users, Trophy } from "lucide-react";

const modes = [
  {
    icon: Swords,
    title: "1v1 Wagered",
    description:
      "Challenge another player directly. Both players stake SOL or SPL tokens. Winner takes all.",
    tag: "Most Popular",
  },
  {
    icon: Clock,
    title: "Timed Matches",
    description:
      "Blitz, Rapid, or Classical time controls. The clock ticks on-chain — no disputes, no excuses.",
    tag: "Competitive",
  },
  {
    icon: Users,
    title: "Open Arena",
    description:
      "Join any open match in the lobby. Filter by wager amount, time control, or opponent rating.",
    tag: "Flexible",
  },
  {
    icon: Trophy,
    title: "Tournaments",
    description:
      "Coming soon: bracket-style tournaments with prize pools and leaderboard rankings.",
    tag: "Coming Soon",
  },
];

export function GameModes() {
  return (
    <section className="bg-card/30 px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-16 text-center"
        >
          <h2 className="font-heading text-3xl font-bold sm:text-4xl">
            Game Modes
          </h2>
          <p className="mt-3 text-muted-foreground">
            Play however you like — casual, competitive, or high-stakes
          </p>
        </motion.div>

        <div className="grid gap-6 sm:grid-cols-2">
          {modes.map((mode, i) => (
            <motion.div
              key={mode.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
              className="glass-card p-6 transition-colors hover:border-border-hover"
            >
              <div className="flex items-start justify-between">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <mode.icon className="h-5 w-5 text-primary" />
                </div>
                <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {mode.tag}
                </span>
              </div>
              <h3 className="font-heading text-lg font-semibold">{mode.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {mode.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
