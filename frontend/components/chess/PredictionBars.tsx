"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";

interface PredictionBarsProps {
  poolWhite: number;
  poolBlack: number;
  poolDraw: number;
  className?: string;
}

export function PredictionBars({ poolWhite, poolBlack, poolDraw, className = "" }: PredictionBarsProps) {
  const total = poolWhite + poolBlack + poolDraw;
  
  const pctWhite = total === 0 ? 0 : Math.round((poolWhite / total) * 100);
  const pctBlack = total === 0 ? 0 : Math.round((poolBlack / total) * 100);
  const pctDraw = total === 0 ? 0 : Math.round((poolDraw / total) * 100);

  return (
    <div className={`w-full flex flex-col gap-1.5 ${className}`}>
      <div className="flex justify-between text-xs font-semibold px-1">
        <span className="text-white">White {pctWhite}%</span>
        {pctDraw > 0 && <span className="text-accent">Draw {pctDraw}%</span>}
        <span className="text-zinc-400">Black {pctBlack}%</span>
      </div>
      <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden flex">
        <motion.div 
          className="h-full bg-white"
          initial={{ width: 0 }}
          animate={{ width: `${pctWhite}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
        <motion.div 
          className="h-full bg-accent"
          initial={{ width: 0 }}
          animate={{ width: `${pctDraw}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
        <motion.div 
          className="h-full bg-zinc-500"
          initial={{ width: 0 }}
          animate={{ width: `${pctBlack}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
      <div className="text-[10px] text-zinc-500 text-center mt-1">
        Total Pool: {(total / 1e9).toFixed(2)} SOL
      </div>
    </div>
  );
}
