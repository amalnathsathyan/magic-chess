"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Sword, Coins, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreateMatchFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (data: CreateMatchData) => void;
  className?: string;
}

export interface CreateMatchData {
  wagerAmount: number;
  wagerToken: string;
  timeControlMinutes: number;
  timeIncrementSeconds: number;
  rated: boolean;
}

const TIME_CONTROLS = [
  { label: "Bullet 1+0", minutes: 1, increment: 0 },
  { label: "Blitz 3+2", minutes: 3, increment: 2 },
  { label: "Blitz 5+0", minutes: 5, increment: 0 },
  { label: "Rapid 10+5", minutes: 10, increment: 5 },
  { label: "Rapid 15+10", minutes: 15, increment: 10 },
  { label: "Classical 30+0", minutes: 30, increment: 0 },
];

export function CreateMatchForm({
  isOpen,
  onClose,
  onSubmit,
  className,
}: CreateMatchFormProps) {
  const [wagerAmount, setWagerAmount] = useState(0.1);
  const [timeControl, setTimeControl] = useState(TIME_CONTROLS[1]); // 3+2 default

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit?.({
      wagerAmount,
      wagerToken: "SOL",
      timeControlMinutes: timeControl.minutes,
      timeIncrementSeconds: timeControl.increment,
      rated: true,
    });
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn("glass-card p-6", className)}
    >
      <div className="mb-6 flex items-center justify-between">
        <h2 className="font-heading text-lg font-bold">Create Match</h2>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-muted hover:bg-card hover:text-foreground"
        >
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Wager Amount */}
        <div>
          <label className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Coins className="h-4 w-4" />
            Wager Amount (SOL)
          </label>
          <input
            type="number"
            value={wagerAmount}
            onChange={(e) => setWagerAmount(Number(e.target.value))}
            min={0.01}
            step={0.01}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Time Control */}
        <div>
          <label className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Clock className="h-4 w-4" />
            Time Control
          </label>
          <div className="grid grid-cols-3 gap-2">
            {TIME_CONTROLS.map((tc) => (
              <button
                key={tc.label}
                type="button"
                onClick={() => setTimeControl(tc)}
                className={cn(
                  "rounded-lg border border-border px-3 py-2 text-xs font-mono transition-all",
                  timeControl.label === tc.label
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "hover:border-border-hover hover:bg-card"
                )}
              >
                {tc.label}
              </button>
            ))}
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-heading text-sm font-semibold text-primary-foreground transition-all hover:bg-primary-hover hover:shadow-glow"
        >
          <Sword className="h-4 w-4" />
          Create Match
        </button>
      </form>
    </motion.div>
  );
}
