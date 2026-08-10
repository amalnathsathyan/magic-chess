"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[calc(100vh-65px)] items-center justify-center px-4">
      <div className="glass-card flex max-w-md flex-col items-center gap-4 px-6 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-destructive/20 bg-destructive/10">
          <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h1 className="font-heading text-xl font-bold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            An unexpected error occurred. Try again or return to the arena.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-primary"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>
          <Link
            href="/arena"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Arena
          </Link>
        </div>
      </div>
    </div>
  );
}
