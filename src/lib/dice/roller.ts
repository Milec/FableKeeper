import { parseFormula } from "./parser";
import type { DieRoll, ParsedFormula, RollResult, TermResult } from "./types";

/**
 * A random source. Defaults to `Math.random`, but can be injected for
 * deterministic tests or a future cryptographically-secure roller.
 */
export type RandomSource = () => number;

const defaultRandom: RandomSource = Math.random;

/** Roll a single die of the given size using the provided random source. */
export function rollDie(sides: number, random: RandomSource = defaultRandom): number {
  return Math.floor(random() * sides) + 1;
}

/** Evaluate an already-parsed formula. */
export function evaluateFormula(
  parsed: ParsedFormula,
  random: RandomSource = defaultRandom,
): RollResult {
  const terms: TermResult[] = [];
  let total = 0;

  for (const entry of parsed.terms) {
    if (entry.kind === "modifier") {
      const subtotal = entry.sign * entry.term.value;
      total += subtotal;
      terms.push({
        sign: entry.sign,
        subtotal,
        label: `${entry.sign === -1 ? "-" : "+"}${entry.term.value}`,
      });
      continue;
    }

    const { count, sides, keep } = entry.term;
    const rolls: DieRoll[] = Array.from({ length: count }, () => ({
      sides,
      value: rollDie(sides, random),
      dropped: false,
    }));

    if (keep) {
      // Determine which indices to keep, marking the rest as dropped.
      const order = rolls
        .map((roll, index) => ({ index, value: roll.value }))
        .sort((a, b) =>
          keep.type === "highest" ? b.value - a.value : a.value - b.value,
        );
      const keptIndices = new Set(order.slice(0, keep.amount).map((o) => o.index));
      rolls.forEach((roll, index) => {
        roll.dropped = !keptIndices.has(index);
      });
    }

    const kept = rolls.filter((r) => !r.dropped);
    const sum = kept.reduce((acc, r) => acc + r.value, 0);
    const subtotal = entry.sign * sum;
    total += subtotal;

    const keepSuffix = keep
      ? `${keep.type === "highest" ? "kh" : "kl"}${keep.amount}`
      : "";
    const prefix = entry.sign === -1 ? "-" : terms.length === 0 ? "" : "+";
    terms.push({
      sign: entry.sign,
      rolls,
      subtotal,
      label: `${prefix}${count}d${sides}${keepSuffix}`,
    });
  }

  return {
    formula: parsed.raw,
    terms,
    total,
    timestamp: new Date().toISOString(),
  };
}

/** Parse and roll a dice-notation string in one call. */
export function roll(formula: string, random: RandomSource = defaultRandom): RollResult {
  return evaluateFormula(parseFormula(formula), random);
}

/** Roll a formula `times` times, returning every individual result. */
export function rollMany(
  formula: string,
  times: number,
  random: RandomSource = defaultRandom,
): RollResult[] {
  const parsed = parseFormula(formula);
  return Array.from({ length: Math.max(1, times) }, () =>
    evaluateFormula(parsed, random),
  );
}
