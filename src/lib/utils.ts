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

/**
 * A name to greet someone by.
 *
 * Falls back to the email local part when no display name is set, but tidies it
 * first: raw local parts like `ada.lovelace3` read badly in a large display-font
 * heading. Separators become spaces, trailing digits are dropped, and each word
 * is capitalised — `ada.lovelace3` becomes "Ada Lovelace".
 */
export function greetingName(
  displayName: string | null | undefined,
  email: string | null | undefined,
): string {
  const explicit = displayName?.trim();
  if (explicit) return explicit;

  const local = email?.split("@")[0] ?? "";
  const words = local
    .split(/[._\-+]+/)
    .map((part) => part.replace(/\d+$/, ""))
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1));

  if (!words.length) return "Keeper";
  // Two words is a name; more is usually an address, not something to read out.
  return words.slice(0, 2).join(" ");
}
