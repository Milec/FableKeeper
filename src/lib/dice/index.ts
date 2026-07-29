/**
 * FableKeeper dice engine.
 *
 * A dependency-free, deterministic-testable implementation of standard tabletop
 * dice notation. Used directly by the dice roller UI and reused throughout the
 * app (rollable tables, encounters, generators). See `roller.ts` for the API.
 */
export * from "./types";
export * from "./parser";
export * from "./roller";

import type { RollResult } from "./types";

/** Format a roll result as a compact, copy-pasteable string. */
export function formatRollResult(result: RollResult): string {
  const breakdown = result.terms
    .map((term) => {
      if (!term.rolls) return term.label;
      const dice = term.rolls
        .map((r) => (r.dropped ? `~~${r.value}~~` : `${r.value}`))
        .join(", ");
      return `${term.label} [${dice}]`;
    })
    .join(" ");
  return `${result.formula} = ${breakdown} → ${result.total}`;
}
