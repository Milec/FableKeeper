import { describe, expect, it } from "vitest";
import { createRng, hashSeed } from "./random";
import { generateNames } from "./names";
import { generateNpc, npcToMarkdown } from "./npc";
import { generateShop, shopToMarkdown } from "./shop";
import { generateBackstory } from "./backstory";
import { ANCESTRIES } from "./data";

describe("createRng", () => {
  it("is deterministic for a given seed", () => {
    const a = createRng("hello");
    const b = createRng("hello");
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  it("differs across seeds", () => {
    expect(createRng("a").next()).not.toBe(createRng("b").next());
  });

  it("int stays within bounds", () => {
    const rng = createRng(1);
    for (let i = 0; i < 200; i++) {
      const n = rng.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });

  it("sample returns distinct elements", () => {
    const rng = createRng(2);
    const picks = rng.sample([1, 2, 3, 4, 5], 3);
    expect(picks).toHaveLength(3);
    expect(new Set(picks).size).toBe(3);
  });

  it("hashSeed is stable", () => {
    expect(hashSeed("golarion")).toBe(hashSeed("golarion"));
  });
});

describe("generateNames", () => {
  it("produces the requested count", () => {
    expect(generateNames({ kind: "person", count: 8, seed: 1 })).toHaveLength(8);
  });

  it("is reproducible with a seed", () => {
    const opts = { kind: "tavern" as const, count: 4, seed: "seed" };
    expect(generateNames(opts)).toEqual(generateNames(opts));
  });

  it("formats taverns and ships with 'The'", () => {
    expect(generateNames({ kind: "tavern", count: 1, seed: 1 })[0]).toMatch(/^The /);
    expect(generateNames({ kind: "ship", count: 1, seed: 1 })[0]).toMatch(/^The /);
  });

  it("honors a specific ancestry", () => {
    const names = generateNames({ kind: "person", ancestry: "Dwarf", count: 5, seed: 3 });
    expect(names).toHaveLength(5);
  });
});

describe("generated prose grammar", () => {
  it("agrees with singular 'they' in biographies and backstories", () => {
    // Flaws are rendered as "they {flaw}", so a third-person-singular verb
    // ("they trusts the wrong people") reads as broken. Guard every seed.
    const bad = /\bthey (?:trusts|drinks|keeps|holds|lies|is)\b/i;
    for (let i = 0; i < 60; i++) {
      const npc = generateNpc({ seed: `grammar-${i}` });
      expect(npc.biography).not.toMatch(bad);
      const back = generateBackstory({ seed: `grammar-b-${i}` });
      expect(back.history).not.toMatch(bad);
    }
  });
});

describe("generateNpc", () => {
  it("fills every field", () => {
    const npc = generateNpc({ seed: "npc" });
    expect(npc.name).toBeTruthy();
    expect(ANCESTRIES).toContain(npc.ancestry);
    expect(npc.hooks).toHaveLength(3);
    expect(npc.biography.length).toBeGreaterThan(20);
  });

  it("respects fixed options", () => {
    const npc = generateNpc({ ancestry: "Elf", alignment: "Chaotic Good", seed: 5 });
    expect(npc.ancestry).toBe("Elf");
    expect(npc.alignment).toBe("Chaotic Good");
  });

  it("is reproducible and renders markdown", () => {
    const a = generateNpc({ seed: "same" });
    const b = generateNpc({ seed: "same" });
    expect(a).toEqual(b);
    expect(npcToMarkdown(a)).toContain(`# ${a.name}`);
  });
});

describe("generateShop", () => {
  it("produces inventory that fits the settlement size", () => {
    const shop = generateShop({ settlementSize: "thorp", seed: 7 });
    expect(shop.items.length).toBeGreaterThanOrEqual(1);
    expect(shop.items.length).toBeLessThanOrEqual(5);
    expect(shop.items[0]?.price).toBeTruthy();
  });

  it("respects a chosen shop type", () => {
    const shop = generateShop({ shopType: "weapons", seed: 2 });
    expect(shop.type).toBe("Weaponsmith");
  });

  it("renders a markdown table", () => {
    const shop = generateShop({ seed: 9 });
    expect(shopToMarkdown(shop)).toContain("| Item | Price | Qty |");
  });
});

describe("generateBackstory", () => {
  it("produces summary, history, goals, and hooks", () => {
    const b = generateBackstory({ seed: "back" });
    expect(b.summary).toBeTruthy();
    expect(b.history.length).toBeGreaterThan(40);
    expect(b.hooks).toHaveLength(3);
    expect(b.goals).toContain(b.name);
  });

  it("uses a provided name", () => {
    const b = generateBackstory({ name: "Corvin Vale", seed: 1 });
    expect(b.name).toBe("Corvin Vale");
  });
});
