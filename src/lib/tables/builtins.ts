import data from "@/data/pf2e/tables.json";
import type { TableEntry } from "./roll";

/**
 * Built-in PF2E tables.
 *
 * These are the real published tables, ingested from open-licensed Pathfinder
 * 2e sources by `scripts/fetch-pf2e-data.mjs` — not invented content. Each one
 * keeps its source book and page for attribution.
 *
 * Two kinds are shipped:
 *   - `rollable`  — genuine "roll a die and read across" tables.
 *   - `reference` — level/score lookup tables (treasure by level, and friends).
 *     Structurally identical, but you index into them rather than roll.
 *
 * Note: Pathfinder 2e's open-licensed core books contain comparatively few pure
 * random tables; most published random tables live in Adventure Paths and card
 * decks, which are closed content and deliberately excluded. Users can add
 * anything else via custom tables or JSON import.
 */

export interface BuiltinTable {
  id: string;
  name: string;
  kind: "rollable" | "reference";
  /** Readable source book name, used as the category label. */
  category: string;
  source: string;
  page?: number;
  /** The die (or index column) label as printed, e.g. "d20", "d%", "Level". */
  die: string;
  /** Headers for the result column(s). */
  columns: string[];
  entries: TableEntry[];
}

interface TablesFile {
  meta: {
    generatedAt: string;
    source: string;
    note: string;
    sources: Record<string, string>;
  };
  tables: BuiltinTable[];
}

const file = data as unknown as TablesFile;

export const PF2E_DATA_META = file.meta;

/** Every bundled table, both kinds. */
export const ALL_BUILTIN_TABLES: BuiltinTable[] = file.tables;

/** Genuine roll tables — the ones with a big Roll button. */
export const BUILTIN_TABLES: BuiltinTable[] = file.tables.filter(
  (t) => t.kind === "rollable",
);

/** Lookup tables (by level, score, …) shown for reference. */
export const REFERENCE_TABLES: BuiltinTable[] = file.tables.filter(
  (t) => t.kind === "reference",
);

export function getBuiltinTable(id: string): BuiltinTable | undefined {
  return ALL_BUILTIN_TABLES.find((t) => t.id === id);
}

/** Human-readable attribution line, e.g. "Bestiary p. 180". */
export function attribution(table: BuiltinTable): string {
  return table.page ? `${table.category} p. ${table.page}` : table.category;
}
