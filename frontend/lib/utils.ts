import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes with conflict resolution (used by shadcn/ui components) */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
