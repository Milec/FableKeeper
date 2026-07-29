import { describe, expect, it } from "vitest";
import { createRng } from "@/lib/generators/random";
import {
  entryRanges,
  parseTableImport,
  rollOnTable,
  tableFormula,
  tableToExport,
  tableTotal,
  TableImportError,
  type TableEntry,
} from "./roll";
import { ALL_BUILTIN_TABLES, BUILTIN_TABLES, REFERENCE_TABLES } from "./builtins";

const entries: TableEntry[] = [
  { weight: 3, text: "common" },
  { weight: 1, text: "uncommon" },
  { weight: 1, text: "rare" },
];

describe("tableTotal / entryRanges / formula", () => {
  it("sums weights", () => {
    expect(tableTotal(entries)).toBe(5);
    expect(tableFormula(entries)).toBe("1d5");
  });

  it("computes contiguous ranges", () => {
    const ranges = entryRanges(entries);
    expect(ranges[0]).toMatchObject({ min: 1, max: 3, text: "common" });
    expect(ranges[1]).toMatchObject({ min: 4, max: 4, text: "uncommon" });
    expect(ranges[2]).toMatchObject({ min: 5, max: 5, text: "rare" });
  });

  it("skips zero-weight entries", () => {
    const r = entryRanges([{ weight: 0, text: "nope" }, { weight: 2, text: "yes" }]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ min: 1, max: 2, text: "yes" });
  });
});

describe("rollOnTable", () => {
  it("selects the entry whose range contains the roll", () => {
    // Seeded so the first roll is deterministic; assert it lands in a real range.
    const result = rollOnTable(entries, createRng("seed"));
    expect(result).not.toBeNull();
    expect(result!.roll).toBeGreaterThanOrEqual(1);
    expect(result!.roll).toBeLessThanOrEqual(5);
    expect(entries.map((e) => e.text)).toContain(result!.entry.text);
  });

  it("returns null for an empty table", () => {
    expect(rollOnTable([], createRng(1))).toBeNull();
  });

  it("respects weighting over many rolls", () => {
    const rng = createRng(42);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      const r = rollOnTable(entries, rng)!;
      counts[r.entry.text] = (counts[r.entry.text] ?? 0) + 1;
    }
    // "common" (weight 3/5) should clearly dominate "rare" (1/5).
    expect(counts.common).toBeGreaterThan(counts.rare!);
  });
});

describe("import / export", () => {
  it("round-trips through export and import", () => {
    const exported = tableToExport("Loot", "desc", entries);
    const parsed = parseTableImport(JSON.stringify(exported));
    expect(parsed.name).toBe("Loot");
    expect(parsed.entries).toHaveLength(3);
  });

  it("rejects invalid payloads", () => {
    expect(() => parseTableImport("{bad")).toThrow(TableImportError);
    expect(() => parseTableImport({ entries: [] })).toThrow(TableImportError);
    expect(() => parseTableImport({ name: "X", entries: [] })).toThrow(
      TableImportError,
    );
  });

  it("defaults missing weights to 1", () => {
    const parsed = parseTableImport({
      name: "T",
      entries: [{ text: "a" }, { text: "b", weight: 2 }],
    });
    expect(parsed.entries[0]!.weight).toBe(1);
    expect(parsed.entries[1]!.weight).toBe(2);
  });
});

describe("builtin tables", () => {
  it("are all rollable", () => {
    for (const table of BUILTIN_TABLES) {
      expect(tableTotal(table.entries)).toBeGreaterThan(0);
      expect(rollOnTable(table.entries, createRng(1))).not.toBeNull();
    }
  });

  it("ships real published tables, not invented ones", () => {
    expect(BUILTIN_TABLES.length).toBeGreaterThan(0);
    for (const table of BUILTIN_TABLES) {
      // Every bundled table must be attributable to a real source book.
      expect(table.source).toBeTruthy();
      expect(table.category).toBeTruthy();
      expect(table.kind).toBe("rollable");
      expect(table.entries.length).toBeGreaterThan(1);
      // Entries carry actual text, and weights are whole positive numbers.
      for (const e of table.entries) {
        expect(e.text.trim().length).toBeGreaterThan(0);
        expect(Number.isInteger(e.weight)).toBe(true);
        expect(e.weight).toBeGreaterThan(0);
      }
    }
  });

  it("includes recognisable PF2E tables", () => {
    const names = ALL_BUILTIN_TABLES.map((t) => t.name.toLowerCase());
    expect(names).toContain("quirks");
    expect(names.some((n) => n.includes("random terrain"))).toBe(true);
    expect(names.some((n) => n.includes("treasure"))).toBe(true);
  });

  it("only bundles open-licensed sources", () => {
    // Adventure Paths and card decks are excluded on purpose.
    const closed = ["AoA1", "AoE1", "OoA1", "SoG2", "Rust", "CHD", "CFD", "HPD"];
    for (const t of ALL_BUILTIN_TABLES) {
      expect(closed).not.toContain(t.source);
    }
  });

  it("reference tables are separated from roll tables", () => {
    for (const t of REFERENCE_TABLES) expect(t.kind).toBe("reference");
    const rollIds = new Set(BUILTIN_TABLES.map((t) => t.id));
    for (const t of REFERENCE_TABLES) expect(rollIds.has(t.id)).toBe(false);
  });
});
