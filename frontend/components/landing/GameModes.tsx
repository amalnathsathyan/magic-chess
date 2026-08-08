"use client";

import { motion } from "framer-motion";
import { Zap, Clock, Hourglass } from "lucide-react";

const modes = [
  {
    icon: Zap,
    title: "Bullet",
    timeControl: "1 minute",
    description: "One minute is allowed for each move before the opponent can claim timeout.",
    tag: "Per move",
  },
  {
    icon: Clock,
    title: "Blitz",
    timeControl: "3 minutes",
    description: "Three minutes per move for a faster game with room to calculate.",
    tag: "Per move",
  },
  {
    icon: Hourglass,
    title: "Rapid",
    timeControl: "10 minutes",
    description: "Ten minutes per move for deliberate, higher-stakes positions.",
    tag: "Per move",
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
          <h2 className="font-heading text-3xl font-bold sm:text-4xl text-foreground">
            Choose Your Arena
          </h2>
          <p className="mt-3 font-body text-muted-foreground">
            Choose the per-move timeout; set the wager when creating the match
          </p>
        </motion.div>

        <div className="grid gap-6 sm:grid-cols-3">
          {modes.map((mode, i) => (
            <motion.div
              key={mode.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              whileHover={{ y: -5, borderColor: "var(--color-primary)", boxShadow: "var(--shadow-glow)" }}
              transition={{ delay: i * 0.1, duration: 0.3 }}
              className="glass-card flex flex-col p-6 transition-all border-transparent"
            >
              <div className="flex items-start justify-between">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <mode.icon className="h-6 w-6 text-primary" />
                </div>
                <span className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary">
                  {mode.tag}
                </span>
              </div>
              
              <div className="flex items-end gap-2 mb-2">
                <h3 className="font-heading text-2xl font-bold text-foreground">{mode.title}</h3>
                <span className="font-mono text-sm text-muted-foreground mb-1">{mode.timeControl}</span>
              </div>
              
              <p className="font-body text-sm text-muted-foreground mb-6 flex-grow">
                {mode.description}
              </p>
              
              <p className="mt-auto text-xs font-medium uppercase tracking-wider text-primary/80">
                Wager selected at creation
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
