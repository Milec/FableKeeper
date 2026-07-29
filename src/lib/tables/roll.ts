import { createRng, type Rng } from "@/lib/generators/random";

/**
 * Rollable table logic (Foundry-style). A table is a list of weighted entries;
 * rolling picks one entry proportional to its weight, mirroring a die roll
 * across the entries' cumulative ranges. Pure and testable — the UI layers a
 * dice animation on top.
 */

export interface TableEntry {
  weight: number;
  text: string;
}

export interface EntryRange extends TableEntry {
  /** Inclusive lower bound on the notional d{total} roll. */
  min: number;
  /** Inclusive upper bound. */
  max: number;
}

/** Total weight of a table (the size of the notional die). */
export function tableTotal(entries: TableEntry[]): number {
  return entries.reduce((sum, e) => sum + Math.max(0, Math.floor(e.weight || 0)), 0);
}

/** Compute the inclusive [min,max] range each entry occupies. */
export function entryRanges(entries: TableEntry[]): EntryRange[] {
  const ranges: EntryRange[] = [];
  let cursor = 1;
  for (const entry of entries) {
    const weight = Math.max(0, Math.floor(entry.weight || 0));
    if (weight <= 0) continue;
    ranges.push({ ...entry, min: cursor, max: cursor + weight - 1 });
    cursor += weight;
  }
  return ranges;
}

export interface TableRollResult {
  roll: number;
  total: number;
  entry: TableEntry;
  index: number;
}

/** Roll on a table. Returns the rolled number and the selected entry. */
export function rollOnTable(
  entries: TableEntry[],
  rng: Rng = createRng(),
): TableRollResult | null {
  const ranges = entryRanges(entries);
  const total = ranges.length ? ranges[ranges.length - 1]!.max : 0;
  if (total <= 0) return null;

  const roll = rng.int(1, total);
  const index = ranges.findIndex((r) => roll >= r.min && roll <= r.max);
  const entry = ranges[index]!;
  return { roll, total, entry: { weight: entry.weight, text: entry.text }, index };
}

/** The dice notation a table's total corresponds to (e.g. "1d100"). */
export function tableFormula(entries: TableEntry[]): string {
  const total = tableTotal(entries);
  return total > 0 ? `1d${total}` : "—";
}

// ---------------------------------------------------------------------------
// JSON import / export
// ---------------------------------------------------------------------------

export interface TableExport {
  fablekeeper: { version: 1; kind: "roll_table" };
  name: string;
  description?: string;
  entries: TableEntry[];
}

export function tableToExport(
  name: string,
  description: string | null,
  entries: TableEntry[],
): TableExport {
  return {
    fablekeeper: { version: 1, kind: "roll_table" },
    name,
    description: description ?? undefined,
    entries,
  };
}

export class TableImportError extends Error {}

/** Parse an imported table JSON payload into a name/description/entries triple. */
export function parseTableImport(input: string | unknown): {
  name: string;
  description: string | null;
  entries: TableEntry[];
} {
  let root: unknown = input;
  if (typeof input === "string") {
    try {
      root = JSON.parse(input);
    } catch {
      throw new TableImportError("That isn't valid JSON.");
    }
  }
  if (!root || typeof root !== "object") {
    throw new TableImportError("Expected a table object.");
  }
  const obj = root as Record<string, unknown>;
  const name = typeof obj.name === "string" && obj.name.trim() ? obj.name.trim() : null;
  if (!name) throw new TableImportError("The table needs a name.");
  const rawEntries = Array.isArray(obj.entries) ? obj.entries : [];
  const entries: TableEntry[] = rawEntries
    .map((e) => {
      const entry = e as Record<string, unknown>;
      const text = typeof entry.text === "string" ? entry.text : "";
      const weight =
        typeof entry.weight === "number" && entry.weight > 0
          ? Math.floor(entry.weight)
          : 1;
      return { text, weight };
    })
    .filter((e) => e.text.trim().length > 0);
  if (entries.length === 0) {
    throw new TableImportError("The table has no usable entries.");
  }
  return {
    name,
    description:
      typeof obj.description === "string" ? obj.description : null,
    entries,
  };
}
