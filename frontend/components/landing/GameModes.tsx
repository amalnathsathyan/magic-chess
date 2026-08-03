"use client";

import { motion } from "framer-motion";
import { Zap, Clock, Hourglass } from "lucide-react";

const modes = [
  {
    icon: Zap,
    title: "Blitz",
    timeControl: "3 | 2",
    description: "Fast-paced action. 3 minutes plus 2 seconds increment.",
    wagers: ["0.1 SOL", "0.5 SOL", "1 SOL"],
    tag: "High Intensity",
  },
  {
    icon: Clock,
    title: "Rapid",
    timeControl: "10 | 0",
    description: "The sweet spot. 10 minutes with no increment.",
    wagers: ["0.5 SOL", "1 SOL", "5 SOL"],
    tag: "Most Popular",
  },
  {
    icon: Hourglass,
    title: "Standard",
    timeControl: "30 | 0",
    description: "Deep calculation. 30 minutes with no increment.",
    wagers: ["1 SOL", "5 SOL", "10 SOL"],
    tag: "Strategic",
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
            Select your preferred time control and wager amount
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
              className="glass-card flex flex-col p-6 transition-all cursor-pointer border-transparent"
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
              
              <div className="mt-auto">
                <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider">Popular Wagers</p>
                <div className="flex flex-wrap gap-2">
                  {mode.wagers.map((wager) => (
                    <span key={wager} className="rounded border border-border bg-card/50 px-2 py-1 font-mono text-xs text-foreground hover:bg-primary/20 hover:border-primary/50 transition-colors">
                      {wager}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
