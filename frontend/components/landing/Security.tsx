"use client";

import { motion } from "framer-motion";
import { ShieldCheck, Lock, FileCode2, TestTube } from "lucide-react";

const signals = [
  {
    icon: ShieldCheck,
    title: "94/100 Audit Score",
    value: "Security First",
    description: "Thoroughly audited Anchor program ensuring no backdoors or vulnerabilities.",
    color: "text-primary",
    bg: "bg-primary/10",
  },
  {
    icon: Lock,
    title: "PDA Escrow",
    value: "100% Non-Custodial",
    description: "Wagers are securely locked in Program Derived Addresses until the match ends.",
    color: "text-accent",
    bg: "bg-accent/10",
  },
  {
    icon: TestTube,
    title: "205 Tests Passed",
    value: "100% Coverage",
    description: "Comprehensive test suite covering all edge cases, illegal moves, and settlements.",
    color: "text-primary",
    bg: "bg-primary/10",
  },
  {
    icon: FileCode2,
    title: "Open Source",
    value: "Public Logic",
    description: "Entire frontend, backend, and smart contract codebase is fully open source.",
    color: "text-accent",
    bg: "bg-accent/10",
  },
];

export function Security() {
  return (
    <section className="px-4 py-24 sm:px-6 lg:px-8 border-t border-border/50">
      <div className="mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-16 text-center"
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
            <ShieldCheck className="h-4 w-4" />
            Bank-Grade Security
          </div>
          <h2 className="font-heading text-3xl font-bold sm:text-4xl text-foreground">
            Security You Can Trust
          </h2>
          <p className="mt-3 font-body text-muted-foreground">
            Built for real money stakes. Secure by default.
          </p>
        </motion.div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {signals.map((signal, i) => (
            <motion.div
              key={signal.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              whileHover={{ y: -5 }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
              className="glass-card p-6 flex flex-col items-center text-center"
            >
              <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${signal.bg}`}>
                <signal.icon className={`h-6 w-6 ${signal.color}`} />
              </div>
              <h3 className="font-heading text-xl font-bold text-foreground mb-1">
                {signal.title}
              </h3>
              <p className={`font-mono text-xs uppercase tracking-wider font-semibold mb-3 ${signal.color}`}>
                {signal.value}
              </p>
              <p className="font-body text-sm text-muted-foreground">
                {signal.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
