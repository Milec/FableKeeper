import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class names while resolving conflicts. Standard shadcn/ui
 * helper used by every UI primitive.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a date consistently across the app (locale-aware, no time). */
export function formatDate(input: string | number | Date): string {
  const date = input instanceof Date ? input : new Date(input);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

/** Turn an arbitrary string into a URL/anchor-safe slug. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Deterministically pick an element from an array. Used by generators/tests. */
export function pickWeighted<T>(
  items: readonly { value: T; weight: number }[],
  random: number,
): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let threshold = random * total;
  for (const item of items) {
    threshold -= item.weight;
    if (threshold <= 0) return item.value;
  }
  // Fallback for floating point edge cases.
  return items[items.length - 1]!.value;
}
