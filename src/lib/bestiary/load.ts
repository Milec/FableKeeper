import type { BestiaryData } from "./types";

let cached: BestiaryData | null = null;

/**
 * Load the bundled PF2E bestiary.
 *
 * Uses a dynamic import so the ~150 KB dataset is code-split out of the main
 * bundle and only fetched when a tool actually needs it (then memoised for the
 * rest of the session).
 */
export async function loadBestiary(): Promise<BestiaryData> {
  if (cached) return cached;
  const mod = await import("@/data/pf2e/bestiary.json");
  cached = (mod.default ?? mod) as unknown as BestiaryData;
  return cached;
}
