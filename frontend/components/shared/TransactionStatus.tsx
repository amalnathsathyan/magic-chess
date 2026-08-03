"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle, XCircle, ExternalLink } from "lucide-react";
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
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        className={cn("glass-card flex items-center gap-3 px-4 py-3", className)}
      >
        {status === "submitting" || status === "confirming" ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        ) : status === "success" ? (
          <CheckCircle className="h-5 w-5 text-primary" />
        ) : status === "error" ? (
          <XCircle className="h-5 w-5 text-destructive" />
        ) : null}

        <div className="flex-1">
          <p className="text-sm font-medium">
            {status === "submitting" && "Submitting transaction..."}
            {status === "confirming" && "Confirming on Solana..."}
            {status === "success" && "Transaction confirmed"}
            {status === "error" && "Transaction failed"}
          </p>
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
          {signature && (
            <a
              href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs text-muted hover:text-primary"
            >
              <ExternalLink className="h-3 w-3" />
              {signature.slice(0, 8)}...{signature.slice(-8)}
            </a>
          )}
        </div>

        {onDismiss && (status === "success" || status === "error") && (
          <button
            onClick={onDismiss}
            className="text-muted hover:text-foreground"
          >
            ✕
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
