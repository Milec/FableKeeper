import { describe, expect, it } from "vitest";
import { parseFormula, validateFormula, DiceParseError } from "./parser";
import { evaluateFormula, roll, rollDie, type RandomSource } from "./roller";
import { formatRollResult } from "./index";

/**
 * A deterministic random source that cycles through the supplied 0..1 values.
 * `rollDie` computes `floor(random() * sides) + 1`, so a value of ~0 yields the
 * minimum face and a value approaching 1 yields the maximum.
 */
function seeded(values: number[]): RandomSource {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe("parseFormula", () => {
  it("parses a simple die", () => {
    const parsed = parseFormula("1d20");
    expect(parsed.terms).toHaveLength(1);
    expect(parsed.terms[0]).toMatchObject({ kind: "dice", sign: 1 });
  });

  it("defaults an omitted count to 1", () => {
    const parsed = parseFormula("d6");
    expect(parsed.terms[0]).toMatchObject({ term: { count: 1, sides: 6 } });
  });

  it("parses modifiers and signs", () => {
    const parsed = parseFormula("3d8+4");
    expect(parsed.terms).toHaveLength(2);
    expect(parsed.terms[1]).toMatchObject({ kind: "modifier", sign: 1, term: { value: 4 } });

    const negative = parseFormula("1d100-5");
    expect(negative.terms[1]).toMatchObject({ kind: "modifier", sign: -1 });
  });

  it("parses keep-highest and keep-lowest", () => {
    const kh = parseFormula("4d6kh3");
    expect(kh.terms[0]).toMatchObject({
      term: { count: 4, sides: 6, keep: { type: "highest", amount: 3 } },
    });
    const kl = parseFormula("2d20kl1");
    expect(kl.terms[0]).toMatchObject({
      term: { keep: { type: "lowest", amount: 1 } },
    });
  });

  it("defaults keep amount to 1", () => {
    const parsed = parseFormula("2d20kh");
    expect(parsed.terms[0]).toMatchObject({ term: { keep: { amount: 1 } } });
  });

  it("rejects invalid input", () => {
    expect(() => parseFormula("")).toThrow(DiceParseError);
    expect(() => parseFormula("hello")).toThrow(DiceParseError);
    expect(() => parseFormula("1d20+")).toThrow(DiceParseError);
    expect(() => parseFormula("4d6kh9")).toThrow(DiceParseError); // keep > count
    expect(() => parseFormula("9999d6")).toThrow(DiceParseError); // too many dice
  });

  it("validateFormula returns null for valid and a message for invalid", () => {
    expect(validateFormula("2d6+3")).toBeNull();
    expect(validateFormula("nonsense")).toBeTypeOf("string");
  });
});

describe("rollDie", () => {
  it("stays within [1, sides]", () => {
    const random = seeded([0, 0.5, 0.999999]);
    expect(rollDie(20, random)).toBe(1);
    expect(rollDie(20, random)).toBe(11);
    expect(rollDie(20, random)).toBe(20);
  });
});

describe("roll / evaluateFormula", () => {
  it("sums dice and modifiers deterministically", () => {
    // 3d8 all rolling max (8) + 4 = 28
    const result = roll("3d8+4", seeded([0.999999]));
    expect(result.total).toBe(28);
    expect(result.terms[0]?.rolls).toHaveLength(3);
  });

  it("applies keep-highest by dropping the lowest dice", () => {
    // Four d6 rolling 1,2,3,4 (via 0, .2, .4, .6). kh3 keeps 2+3+4 = 9.
    const result = roll("4d6kh3", seeded([0, 0.2, 0.4, 0.6]));
    expect(result.total).toBe(9);
    const dropped = result.terms[0]?.rolls?.filter((r) => r.dropped) ?? [];
    expect(dropped).toHaveLength(1);
    expect(dropped[0]?.value).toBe(1);
  });

  it("applies keep-lowest (disadvantage) by dropping the higher die", () => {
    // 2d20kl1 rolling 20 then 1 keeps the 1.
    const result = roll("2d20kl1", seeded([0.999999, 0]));
    expect(result.total).toBe(1);
  });

  it("subtracts negative terms", () => {
    const result = roll("1d6-2", seeded([0.999999])); // 6 - 2 = 4
    expect(result.total).toBe(4);
  });

  it("records a timestamp and echoes the formula", () => {
    const result = roll("1d20", seeded([0.5]));
    expect(result.formula).toBe("1d20");
    expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
  });
});

describe("formatRollResult", () => {
  it("produces a readable breakdown", () => {
    const parsed = parseFormula("2d6+1");
    const result = evaluateFormula(parsed, seeded([0.999999]));
    const text = formatRollResult(result);
    expect(text).toContain("2d6+1 =");
    expect(text).toContain("→");
  });
});
