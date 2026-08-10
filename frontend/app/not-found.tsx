import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100vh-65px)] items-center justify-center px-4">
      <div className="glass-card flex max-w-md flex-col items-center gap-4 px-6 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-card">
          <Search className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h1 className="font-heading text-xl font-bold">Page not found</h1>
          <p className="text-sm text-muted-foreground">
            The page you are looking for does not exist or has been removed.
          </p>
        </div>
        <Link
          href="/arena"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Arena
        </Link>
      </div>
    </div>
  );
}
