/** Standard polyhedral dice supported by the engine. */
export const DIE_SIZES = [2, 4, 6, 8, 10, 12, 20, 100] as const;
export type DieSize = (typeof DIE_SIZES)[number];

/** A single dice term within a formula, e.g. `4d6kh3` or `2d20kl1`. */
export interface DiceTerm {
  count: number;
  sides: number;
  /** keep-highest (`kh`) / keep-lowest (`kl`) modifier, if present. */
  keep?: { type: "highest" | "lowest"; amount: number };
}

/** A flat numeric modifier within a formula, e.g. the `+4` in `3d8+4`. */
export interface ModifierTerm {
  value: number;
}

export type ParsedTerm =
  | { kind: "dice"; term: DiceTerm; sign: 1 | -1 }
  | { kind: "modifier"; term: ModifierTerm; sign: 1 | -1 };

/** The full parsed representation of a dice formula. */
export interface ParsedFormula {
  raw: string;
  terms: ParsedTerm[];
}

/** The result of rolling a single die. */
export interface DieRoll {
  sides: number;
  value: number;
  /** True when this die was discarded by a keep-highest/lowest modifier. */
  dropped: boolean;
}

/** The result of evaluating one dice term. */
export interface TermResult {
  sign: 1 | -1;
  /** Present for dice terms. */
  rolls?: DieRoll[];
  /** The contribution of this term to the grand total (already signed). */
  subtotal: number;
  /** Human-readable label, e.g. `4d6kh3` or `+4`. */
  label: string;
}

/** The full result of rolling a formula. */
export interface RollResult {
  formula: string;
  terms: TermResult[];
  total: number;
  /** ISO timestamp of when the roll was made. */
  timestamp: string;
}
