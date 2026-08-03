"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle, XCircle, ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";

type TxStatus = "idle" | "submitting" | "confirming" | "success" | "error";

interface TransactionStatusProps {
  status: TxStatus;
  signature?: string;
  error?: string;
  onDismiss?: () => void;
  className?: string;
}

export function TransactionStatus({
  status,
  signature,
  error,
  onDismiss,
  className,
}: TransactionStatusProps) {
  if (status === "idle") return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={cn(
          "glass-card flex items-start gap-3 p-4 shadow-xl border-white/10 bg-[#14141f]/80 backdrop-blur-xl",
          status === "success" && "border-emerald-500/30 shadow-[0_4px_20px_rgba(0,230,118,0.15)]",
          status === "error" && "border-destructive/30 shadow-[0_4px_20px_rgba(239,68,68,0.15)]",
          className
        )}
      >
        <div className="mt-0.5">
          {status === "submitting" || status === "confirming" ? (
            <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
          ) : status === "success" ? (
            <CheckCircle className="h-5 w-5 text-emerald-400" />
          ) : status === "error" ? (
            <XCircle className="h-5 w-5 text-destructive" />
          ) : null}
        </div>

        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">
            {status === "submitting" && "Submitting transaction..."}
            {status === "confirming" && "Confirming on Solana..."}
            {status === "success" && "Transaction Confirmed"}
            {status === "error" && "Transaction Failed"}
          </p>
          {error && (
            <p className="text-xs text-destructive/90 mt-1">{error}</p>
          )}
          {signature && (
            <a
              href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-white/5 px-2 py-1 text-xs font-mono font-medium text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {signature.slice(0, 8)}...{signature.slice(-8)}
            </a>
          )}
        </div>

        {onDismiss && (status === "success" || status === "error") && (
          <button
            onClick={onDismiss}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
