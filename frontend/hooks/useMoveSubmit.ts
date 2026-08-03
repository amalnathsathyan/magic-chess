"use client";

import { useState, useCallback } from "react";
import { useMagicBlock } from "@/hooks/useMagicBlock";
import { toast } from "sonner";

interface UseMoveSubmitOptions {
  matchId: string;
  onSuccess?: (signature: string) => void;
  onError?: (error: Error) => void;
}

interface UseMoveSubmitReturn {
  isSubmitting: boolean;
  lastSignature: string | null;
  error: string | null;
  submitMove: (from: string, to: string, promotion?: string) => Promise<boolean>;
  clearError: () => void;
}

/**
 * Combines MagicBlock session management with move submission logic.
 * Handles optimistic updates, loading states, and error toasts.
 */
export function useMoveSubmit(
  options: UseMoveSubmitOptions
): UseMoveSubmitReturn {
  const { submitMove: submitToER } = useMagicBlock();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSignature, setLastSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submitMove = useCallback(
    async (from: string, to: string, promotion?: string): Promise<boolean> => {
      setIsSubmitting(true);
      setError(null);

      try {
        const signature = await submitToER(options.matchId, from, to, promotion);

        if (!signature) {
          throw new Error("Transaction failed — no signature returned");
        }

        setLastSignature(signature);
        options.onSuccess?.(signature);

        toast.success("Move submitted", {
          description: `Tx: ${signature.slice(0, 8)}...${signature.slice(-8)}`,
        });

        return true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error submitting move";
        setError(message);
        options.onError?.(err instanceof Error ? err : new Error(message));

        toast.error("Failed to submit move", {
          description: message,
        });

        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [options.matchId, submitToER, options.onSuccess, options.onError]
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    isSubmitting,
    lastSignature,
    error,
    submitMove,
    clearError,
  };
}
