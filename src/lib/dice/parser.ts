import type { ParsedFormula, ParsedTerm } from "./types";

export class DiceParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiceParseError";
  }
}

// Matches a single dice term, optionally with a keep-highest/lowest modifier.
//   count "d" sides [ (kh|kl) amount ]
// Examples: 1d20, 2d6, 4d6kh3, 2d20kl1
const DICE_TERM = /^(\d*)d(\d+)(?:(kh|kl)(\d*))?$/i;
// Matches a plain integer modifier, e.g. 4 or 10.
const FLAT_TERM = /^(\d+)$/;

const MAX_DICE = 1000; // guard against pathological formulas (e.g. 9999d20)
const MAX_SIDES = 1000;

/**
 * Parse standard dice notation into a structured formula.
 *
 * Supported grammar (whitespace insensitive):
 *   formula   := term (('+' | '-') term)*
 *   term      := dice | integer
 *   dice      := [count] 'd' sides [('kh'|'kl') [amount]]
 *
 * Examples: `1d20`, `2d6`, `3d8+4`, `4d6kh3`, `2d20kh1`, `1d100-5`.
 */
export function parseFormula(input: string): ParsedFormula {
  const raw = input.trim();
  if (!raw) throw new DiceParseError("Empty dice formula.");

  // Normalise: strip spaces, then split into signed tokens while keeping signs.
  const normalized = raw.replace(/\s+/g, "");
  if (!/^[0-9dkhl+\-]+$/i.test(normalized)) {
    throw new DiceParseError(`Formula contains invalid characters: "${raw}".`);
  }
  if (/[+-]$/.test(normalized) || /[+-]{2,}/.test(normalized)) {
    throw new DiceParseError(`Dangling or repeated operator in "${raw}".`);
  }

  const terms: ParsedTerm[] = [];
  // Split on + / - while capturing the delimiter so signs are preserved.
  const tokens = normalized.match(/[+-]?[^+-]+/g);
  if (!tokens) throw new DiceParseError(`Could not parse formula: "${raw}".`);

  for (const token of tokens) {
    let sign: 1 | -1 = 1;
    let body = token;
    if (body.startsWith("+")) body = body.slice(1);
    else if (body.startsWith("-")) {
      sign = -1;
      body = body.slice(1);
    }
    if (!body) throw new DiceParseError(`Dangling operator in "${raw}".`);

    const dice = DICE_TERM.exec(body);
    if (dice) {
      const count = dice[1] === "" ? 1 : Number.parseInt(dice[1]!, 10);
      const sides = Number.parseInt(dice[2]!, 10);
      if (count < 1 || count > MAX_DICE) {
        throw new DiceParseError(`Dice count out of range (1-${MAX_DICE}) in "${body}".`);
      }
      if (sides < 1 || sides > MAX_SIDES) {
        throw new DiceParseError(`Dice sides out of range (1-${MAX_SIDES}) in "${body}".`);
      }

      const keepType = dice[3]?.toLowerCase();
      let term: ParsedTerm;
      if (keepType) {
        const amount = dice[4] === "" || dice[4] === undefined ? 1 : Number.parseInt(dice[4]!, 10);
        if (amount < 1 || amount > count) {
          throw new DiceParseError(
            `Keep amount ${amount} is invalid for ${count} dice in "${body}".`,
          );
        }
        term = {
          kind: "dice",
          sign,
          term: {
            count,
            sides,
            keep: { type: keepType === "kh" ? "highest" : "lowest", amount },
          },
        };
      } else {
        term = { kind: "dice", sign, term: { count, sides } };
      }
      terms.push(term);
      continue;
    }

    const flat = FLAT_TERM.exec(body);
    if (flat) {
      terms.push({
        kind: "modifier",
        sign,
        term: { value: Number.parseInt(flat[1]!, 10) },
      });
      continue;
    }

    throw new DiceParseError(`Unrecognised term "${body}" in formula "${raw}".`);
  }

  return { raw, terms };
}

/** Validate a formula, returning an error message or `null` if it is valid. */
export function validateFormula(input: string): string | null {
  try {
    parseFormula(input);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid formula.";
  }
}
