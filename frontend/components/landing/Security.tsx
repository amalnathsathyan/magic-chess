"use client";

import { motion } from "framer-motion";
import { Shield, Lock, Eye, FileCheck } from "lucide-react";

const features = [
  {
    icon: Lock,
    title: "Non-Custodial",
    description:
      "Your funds stay in your wallet until a match is joined. Wagers are held in audited escrow PDAs on Solana.",
  },
  {
    icon: Eye,
    title: "Open Source",
    description:
      "The entire codebase is public. Anyone can audit the smart contract, the frontend, and the settlement logic.",
  },
  {
    icon: FileCheck,
    title: "Audited Program",
    description:
      "The MagicChess Anchor program undergoes security audits. No backdoors, no admin rug-pull keys.",
  },
  {
    icon: Shield,
    title: "On-Chain Verification",
    description:
      "Every move, capture, and checkmate is committed to Solana. Disputes are resolved by cryptographic truth.",
  },
];

export function Security() {
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
            Security You Can Trust
          </h2>
          <p className="mt-3 text-muted-foreground">
            Built for real money. Secure by default. Transparent by design.
          </p>
        </motion.div>

        <div className="grid gap-8 sm:grid-cols-2">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
              className="glass-card p-6"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                <feature.icon className="h-5 w-5 text-accent" />
              </div>
              <h3 className="font-heading text-lg font-semibold">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
