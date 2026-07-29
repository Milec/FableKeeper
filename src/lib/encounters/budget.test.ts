import { describe, expect, it } from "vitest";
import {
  combatantXp,
  creatureXp,
  effectiveLevel,
  ratingForXp,
  summarize,
  xpBudget,
  type Combatant,
} from "./budget";

const mob = (over: Partial<Combatant> = {}): Combatant => ({
  id: "x",
  name: "Goblin",
  level: 1,
  count: 1,
  kind: "creature",
  adjustment: "none",
  ...over,
});

describe("xpBudget", () => {
  it("uses base values for a party of four", () => {
    expect(xpBudget(4, "moderate")).toBe(80);
    expect(xpBudget(4, "severe")).toBe(120);
    expect(xpBudget(4, "extreme")).toBe(160);
  });

  it("scales per extra/fewer character", () => {
    expect(xpBudget(5, "moderate")).toBe(100); // +20
    expect(xpBudget(3, "moderate")).toBe(60); // -20
    expect(xpBudget(6, "severe")).toBe(180); // +2*30
  });
});

describe("creatureXp", () => {
  it("matches the PF2E table by level difference", () => {
    expect(creatureXp(5, 5)).toBe(40); // equal
    expect(creatureXp(6, 5)).toBe(60); // +1
    expect(creatureXp(9, 5)).toBe(160); // +4
    expect(creatureXp(1, 5)).toBe(10); // -4
  });

  it("is negligible 5+ levels below", () => {
    expect(creatureXp(0, 5)).toBe(0);
  });

  it("caps at +4", () => {
    expect(creatureXp(20, 5)).toBe(160);
  });
});

describe("effectiveLevel", () => {
  it("shifts by elite/weak", () => {
    expect(effectiveLevel(mob({ level: 3, adjustment: "elite" }))).toBe(4);
    expect(effectiveLevel(mob({ level: 3, adjustment: "weak" }))).toBe(2);
    expect(effectiveLevel(mob({ level: 3 }))).toBe(3);
  });
});

describe("combatantXp", () => {
  it("multiplies by count", () => {
    expect(combatantXp(mob({ level: 5, count: 3 }), 5)).toBe(120); // 3 × 40
  });

  it("applies elite before computing XP", () => {
    // level 4 elite → effective 5 vs party 5 → 40 XP
    expect(combatantXp(mob({ level: 4, adjustment: "elite" }), 5)).toBe(40);
  });

  it("weights simple hazards at ~1/5", () => {
    // creature XP at equal level = 40, simple hazard ≈ 8
    expect(combatantXp(mob({ level: 5, kind: "simple_hazard" }), 5)).toBe(8);
  });

  it("treats complex hazards as full creatures", () => {
    expect(combatantXp(mob({ level: 5, kind: "complex_hazard" }), 5)).toBe(40);
  });
});

describe("ratingForXp / summarize", () => {
  it("classifies totals into threats for a party of four", () => {
    expect(ratingForXp(40, 4)).toBe("trivial");
    expect(ratingForXp(80, 4)).toBe("moderate");
    expect(ratingForXp(159, 4)).toBe("severe");
    expect(ratingForXp(160, 4)).toBe("extreme");
  });

  it("summarizes over/under budget", () => {
    const s = summarize(
      [mob({ level: 5, count: 2 })], // 80 XP
      4,
      5,
      "moderate", // budget 80
    );
    expect(s.totalXp).toBe(80);
    expect(s.budget).toBe(80);
    expect(s.overUnder).toBe(0);
    expect(s.rating).toBe("moderate");
  });
});
