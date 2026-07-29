import { describe, expect, it } from "vitest";
import { generateEncounter } from "./generate";
import { ratingForXp, xpBudget } from "./budget";
import type { Creature } from "@/lib/bestiary/types";
import bestiary from "@/data/pf2e/bestiary.json";

const REAL_POOL = (bestiary as { creatures: Creature[] }).creatures;

const make = (name: string, level: number, types: string[], over: Partial<Creature> = {}): Creature => ({
  name,
  level,
  size: "medium",
  rarity: "common",
  types,
  traits: [],
  source: "B1",
  ...over,
});

describe("bestiary dataset", () => {
  it("ships a substantial creature pool", () => {
    expect(REAL_POOL.length).toBeGreaterThan(900);
  });

  it("has well-formed entries", () => {
    for (const c of REAL_POOL.slice(0, 200)) {
      expect(typeof c.name).toBe("string");
      expect(c.name.length).toBeGreaterThan(0);
      expect(Number.isInteger(c.level)).toBe(true);
      expect(Array.isArray(c.types)).toBe(true);
      expect(c.source.length).toBeGreaterThan(0);
    }
  });

  it("covers the full level range a campaign needs", () => {
    const levels = new Set(REAL_POOL.map((c) => c.level));
    for (const lvl of [0, 1, 5, 10, 15, 20]) {
      expect(levels.has(lvl)).toBe(true);
    }
  });
});

describe("generateEncounter", () => {
  it("lands on the requested threat for a mid-level party", () => {
    const result = generateEncounter({
      pool: REAL_POOL,
      partySize: 4,
      partyLevel: 5,
      threat: "moderate",
      seed: "enc-1",
    });
    expect(result.error).toBeUndefined();
    expect(result.combatants.length).toBeGreaterThan(0);
    expect(result.budget).toBe(xpBudget(4, "moderate"));
    // Should be at or near budget, never wildly over.
    expect(result.totalXp).toBeGreaterThanOrEqual(result.budget * 0.7);
    expect(result.totalXp).toBeLessThanOrEqual(result.budget * 1.25);
  });

  it("is deterministic for a given seed", () => {
    const opts = {
      pool: REAL_POOL,
      partySize: 4,
      partyLevel: 3,
      threat: "severe" as const,
      seed: "same-seed",
    };
    const a = generateEncounter(opts);
    const b = generateEncounter(opts);
    expect(a.combatants.map((c) => `${c.name}x${c.count}`)).toEqual(
      b.combatants.map((c) => `${c.name}x${c.count}`),
    );
  });

  it("varies across seeds", () => {
    const base = { pool: REAL_POOL, partySize: 4, partyLevel: 8, threat: "moderate" as const };
    const a = generateEncounter({ ...base, seed: "a" });
    const b = generateEncounter({ ...base, seed: "zzz" });
    expect(a.combatants.map((c) => c.name).join()).not.toBe(
      b.combatants.map((c) => c.name).join(),
    );
  });

  it("respects a creature-type filter", () => {
    const result = generateEncounter({
      pool: REAL_POOL,
      partySize: 4,
      partyLevel: 6,
      threat: "moderate",
      filters: { types: ["undead"] },
      seed: "undead",
    });
    expect(result.combatants.length).toBeGreaterThan(0);
    for (const c of result.combatants) {
      const creature = REAL_POOL.find((x) => x.name === c.name)!;
      expect(creature.types).toContain("undead");
    }
  });

  it("respects a source filter", () => {
    const result = generateEncounter({
      pool: REAL_POOL,
      partySize: 4,
      partyLevel: 4,
      threat: "low",
      filters: { sources: ["B1"] },
      seed: "b1",
    });
    for (const c of result.combatants) expect(c.source).toBe("B1");
  });

  it("produces a single foe for the solo composition", () => {
    const result = generateEncounter({
      pool: REAL_POOL,
      partySize: 4,
      partyLevel: 10,
      threat: "severe",
      composition: "solo",
      seed: "solo",
    });
    const total = result.combatants.reduce((n, c) => n + c.count, 0);
    expect(total).toBeLessThanOrEqual(3); // one boss, plus at most a little top-up
  });

  it("produces many foes for the horde composition", () => {
    const result = generateEncounter({
      pool: REAL_POOL,
      partySize: 4,
      partyLevel: 10,
      threat: "extreme",
      composition: "horde",
      seed: "horde",
    });
    const total = result.combatants.reduce((n, c) => n + c.count, 0);
    expect(total).toBeGreaterThanOrEqual(4);
  });

  it("groups duplicate creatures with a count", () => {
    const pool = [make("Goblin Warrior", 1, ["humanoid"])];
    const result = generateEncounter({
      pool,
      partySize: 4,
      partyLevel: 3,
      threat: "moderate",
      seed: "dupes",
    });
    expect(result.combatants).toHaveLength(1);
    expect(result.combatants[0]!.count).toBeGreaterThan(1);
  });

  it("reports an error when nothing matches", () => {
    const result = generateEncounter({
      pool: REAL_POOL,
      partySize: 4,
      partyLevel: 5,
      threat: "moderate",
      filters: { types: ["not-a-real-type"] },
      seed: "none",
    });
    expect(result.error).toBeTruthy();
    expect(result.combatants).toHaveLength(0);
  });

  it("never picks creatures outside the meaningful level window", () => {
    const result = generateEncounter({
      pool: REAL_POOL,
      partySize: 4,
      partyLevel: 10,
      threat: "moderate",
      seed: "window",
    });
    for (const c of result.combatants) {
      expect(c.level).toBeGreaterThanOrEqual(6);
      expect(c.level).toBeLessThanOrEqual(14);
    }
  });

  it("reliably rates at the requested threat across parties and levels", () => {
    // Undershooting the budget by even a few XP drops the encounter a whole
    // threat band, so this is the property that actually matters to a GM.
    const threats = ["low", "moderate", "severe", "extreme"] as const;
    let matches = 0;
    let trials = 0;
    const misses: string[] = [];

    for (const threat of threats) {
      for (const partyLevel of [1, 4, 8, 12, 17]) {
        for (const partySize of [3, 4, 5]) {
          for (let i = 0; i < 3; i++) {
            trials++;
            const r = generateEncounter({
              pool: REAL_POOL,
              partySize,
              partyLevel,
              threat,
              seed: `${threat}-${partyLevel}-${partySize}-${i}`,
            });
            if (ratingForXp(r.totalXp, partySize) === threat) matches++;
            else misses.push(`${threat} L${partyLevel} p${partySize}: ${r.totalXp}/${r.budget}`);
          }
        }
      }
    }
    if (misses.length) console.log("threat misses:", misses.slice(0, 5));
    // The exact-budget solver should hit the requested band essentially always.
    expect(matches / trials).toBeGreaterThan(0.99);
  });

  it("never overshoots the budget badly", () => {
    for (const threat of ["low", "moderate", "severe"] as const) {
      for (let i = 0; i < 15; i++) {
        const r = generateEncounter({
          pool: REAL_POOL,
          partySize: 4,
          partyLevel: 7,
          threat,
          seed: `over-${threat}-${i}`,
        });
        expect(r.totalXp).toBeLessThanOrEqual(r.budget * 1.3);
      }
    }
  });
});
