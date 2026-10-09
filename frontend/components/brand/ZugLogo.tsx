import { cn } from "@/lib/utils";

/** Brand colours, also defined as CSS tokens in globals.css. */
export const ZUG = {
  graphite: "#0D0E10",
  bone: "#ECE8DF",
  vermilion: "#FF4F1A",
  ledger: "#9DB4D0",
} as const;

export const SYMBOL_PATH =
  "M12 44V28L16 20L20 12L24 4L28 12L36 16L44 32V36H32L24 32L36 44Z M28 20h4v4h-4z";
export const WORDMARK_PATH =
  "M0 0H92V26L36 74H92V100H0V74L56 26H0Z M102 0H128V74H168V0H194V100H102Z M204 0H296V26H230V74H270V62H252V40H296V100H204Z";

/** The Leap: the knight's g1–f3, with the vermilion square it lands on. */
export function ZugSymbol({
  className,
  ink = "currentColor",
  accent = ZUG.vermilion,
  title,
}: {
  className?: string;
  ink?: string;
  accent?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path fillRule="evenodd" fill={ink} d={SYMBOL_PATH} />
      <rect x="38" y="0" width="8" height="8" fill={accent} />
    </svg>
  );
}

/** "ZUG" set in the brand's square letterforms, with the accent square. */
export function ZugWordmark({
  className,
  ink = "currentColor",
  accent = ZUG.vermilion,
  title = "ZUG",
}: {
  className?: string;
  ink?: string;
  accent?: string;
  title?: string;
}) {
  return (
    <svg viewBox="0 0 328 100" className={className} role="img" aria-label={title}>
      <path fill={ink} d={WORDMARK_PATH} />
      <rect x="306" y="78" width="22" height="22" fill={accent} />
    </svg>
  );
}

/**
 * Lockup: ZUG + a plain descriptor, set lighter than ZUG ("ZUG Arena").
 */
export function ZugLockup({
  descriptor,
  className,
}: {
  descriptor?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-foreground", className)}>
      <ZugSymbol className="h-6 w-6" />
      <ZugWordmark className="h-[18px] w-auto" title={descriptor ? `ZUG ${descriptor}` : "ZUG"} />
      {descriptor ? (
        <span className="font-heading text-[19px] font-normal uppercase leading-none tracking-wide [font-stretch:110%]">
          {descriptor}
        </span>
      ) : null}
    </span>
  );
}
