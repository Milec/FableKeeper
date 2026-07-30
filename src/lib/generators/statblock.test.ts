import { describe, expect, it } from "vitest";
import {
  benchmarkFor,
  damageDice,
  generateStatBlock,
  roleForOccupation,
  statBlockToMarkdown,
  NPC_ROLES,
  type NpcRole,
} from "./statblock";
import { generateNpc, npcToMarkdown } from "./npc";

const ROLES = NPC_ROLES.filter((r) => r !== "auto") as Exclude<NpcRole, "auto">[];

describe("benchmarks dataset", () => {
  it("has data across the campaign level range", () => {
    for (const level of [-1, 0, 1, 5, 10, 15, 20]) {
      const b = benchmarkFor(level);
      expect(b, `level ${level}`).not.toBeNull();
      expect(b!.ac).not.toBeNull();
    }
  });

  it("scales monotonically with level", () => {
    const l1 = benchmarkFor(1)!;
    const l10 = benchmarkFor(10)!;
    const l20 = benchmarkFor(20)!;
    expect(l1.ac!.moderate).toBeLessThan(l10.ac!.moderate);
    expect(l10.ac!.moderate).toBeLessThan(l20.ac!.moderate);
    expect(l1.hp!.moderate).toBeLessThan(l10.hp!.moderate);
    expect(l10.hp!.moderate).toBeLessThan(l20.hp!.moderate);
    expect(l1.attack!.moderate).toBeLessThan(l20.attack!.moderate);
  });

  it("is drawn from a meaningful sample", () => {
    expect(benchmarkFor(1)!.sampleSize).toBeGreaterThan(20);
  });
});

describe("damageDice", () => {
  it("produces notation whose average is close to the target", () => {
    for (const target of [3, 5, 8, 14, 23, 38]) {
      for (const faces of [4, 6, 8, 10, 12]) {
        const expr = damageDice(target, faces);
        const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(expr);
        expect(m, `${target}/${faces} -> ${expr}`).not.toBeNull();
        const n = Number(m![1]);
        const f = Number(m![2]);
        const flat = m![3] ? Number(m![3]) : 0;
        const avg = (n * (f + 1)) / 2 + flat;
        expect(Math.abs(avg - target)).toBeLessThanOrEqual(1.5);
      }
    }
  });

  it("never emits zero dice", () => {
    expect(damageDice(1, 12)).toMatch(/^1d12/);
  });
});

describe("roleForOccupation", () => {
  it("maps fighting occupations to combat roles", () => {
    expect(roleForOccupation("guard")).toBe("soldier");
    expect(roleForOccupation("hunter")).toBe("sniper");
    expect(roleForOccupation("priest")).toBe("caster");
    expect(roleForOccupation("blacksmith")).toBe("brute");
  });

  it("maps peaceful occupations to non-combatants", () => {
    expect(roleForOccupation("innkeeper")).toBe("noncombatant");
    expect(roleForOccupation("farmer")).toBe("noncombatant");
  });

  it("falls back for unknown occupations", () => {
    expect(roleForOccupation("wandering pastry critic")).toBe("expert");
  });
});

describe("generateStatBlock", () => {
  it("fills every field with plausible values", () => {
    const sb = generateStatBlock({ level: 5, role: "soldier", seed: "sb" });
    expect(sb.level).toBe(5);
    expect(sb.role).toBe("soldier");
    expect(sb.ac).toBeGreaterThan(10);
    expect(sb.hp).toBeGreaterThan(0);
    expect(sb.perception).toBeGreaterThan(0);
    expect(sb.attacks.length).toBeGreaterThan(0);
    expect(sb.skills.length).toBeGreaterThan(0);
    for (const save of ["fort", "ref", "will"] as const) {
      expect(Number.isFinite(sb.saves[save])).toBe(true);
    }
  });

  it("is deterministic for a seed", () => {
    const a = generateStatBlock({ level: 7, role: "brute", seed: "same" });
    const b = generateStatBlock({ level: 7, role: "brute", seed: "same" });
    expect(a).toEqual(b);
  });

  it("scales with level", () => {
    const low = generateStatBlock({ level: 1, role: "soldier", seed: "s" });
    const high = generateStatBlock({ level: 15, role: "soldier", seed: "s" });
    expect(high.ac).toBeGreaterThan(low.ac);
    expect(high.hp).toBeGreaterThan(low.hp);
    expect(high.attacks[0]!.bonus).toBeGreaterThan(low.attacks[0]!.bonus);
  });

  it("differentiates roles at the same level", () => {
    const brute = generateStatBlock({ level: 8, role: "brute", seed: "r" });
    const soldier = generateStatBlock({ level: 8, role: "soldier", seed: "r" });
    // A brute is tougher but easier to hit than a soldier of the same level.
    expect(brute.hp).toBeGreaterThanOrEqual(soldier.hp);
    expect(brute.ac).toBeLessThanOrEqual(soldier.ac);
  });

  it("gives spellcasters a spell DC and non-casters none", () => {
    const caster = generateStatBlock({ level: 6, role: "caster", seed: "c" });
    expect(caster.spellcasting).toBeDefined();
    expect(caster.spellcasting!.dc).toBeGreaterThan(10);
    expect(caster.spellcasting!.attack).toBe(caster.spellcasting!.dc - 10);
    expect(generateStatBlock({ level: 6, role: "brute", seed: "c" }).spellcasting).toBeUndefined();
  });

  it("handles every role at every level without producing nonsense", () => {
    for (const role of ROLES) {
      for (let level = -1; level <= 20; level++) {
        const sb = generateStatBlock({ level, role, seed: `${role}-${level}` });
        expect(sb.ac, `${role} L${level} ac`).toBeGreaterThan(8);
        expect(sb.hp, `${role} L${level} hp`).toBeGreaterThan(0);
        expect(sb.attacks[0]!.bonus, `${role} L${level} atk`).toBeGreaterThanOrEqual(0);
        expect(sb.attacks[0]!.damage).toMatch(/^\d+d\d+([+-]\d+)?$/);
        // Ability modifiers should stay in a sane band.
        for (const v of Object.values(sb.abilities)) {
          expect(v).toBeGreaterThanOrEqual(-1);
          expect(v).toBeLessThanOrEqual(12);
        }
      }
    }
  });

  it("infers the role from occupation when set to auto", () => {
    const guard = generateStatBlock({ level: 3, role: "auto", occupation: "guard", seed: "a" });
    expect(guard.role).toBe("soldier");
  });

  it("arms fighting roles with real weapons, not fists", () => {
    for (const role of ROLES) {
      if (role === "noncombatant" || role === "expert") continue;
      for (let i = 0; i < 12; i++) {
        const sb = generateStatBlock({ level: 4, role, seed: `${role}-fist-${i}` });
        for (const atk of sb.attacks) {
          expect(atk.name, `${role} should not punch`).not.toBe("fist");
        }
      }
    }
  });

  it("always lists the role's key-ability skills", () => {
    // A soldier listing only Arcana/Society reads wrong.
    for (let i = 0; i < 15; i++) {
      const sb = generateStatBlock({ level: 5, role: "soldier", seed: `sk-${i}` });
      const names = sb.skills.map((s) => s.name);
      expect(names.some((n) => n === "Athletics" || n === "Intimidation")).toBe(true);
    }
  });
});

describe("NPC level agrees with role", () => {
  it("keeps ordinary townsfolk at townsfolk levels", () => {
    // A village fisher must not be statted as a level-4 creature with a
    // warrior's AC and attack bonus.
    for (const occupation of ["innkeeper", "farmer", "fisher", "merchant", "cook"]) {
      for (let i = 0; i < 10; i++) {
        const npc = generateNpc({ occupation, seed: `${occupation}-${i}` });
        expect(npc.statBlock.role).toBe("noncombatant");
        expect(npc.level, `${occupation} level`).toBeLessThanOrEqual(0);
        expect(npc.statBlock.ac, `${occupation} AC`).toBeLessThanOrEqual(17);
      }
    }
  });

  it("gives fighting occupations combat-worthy levels", () => {
    for (const occupation of ["guard", "soldier", "mercenary"]) {
      for (let i = 0; i < 10; i++) {
        const npc = generateNpc({ occupation, seed: `${occupation}-c-${i}` });
        expect(npc.level).toBeGreaterThanOrEqual(1);
        expect(npc.statBlock.role).toBe("soldier");
      }
    }
  });

  it("honours an explicitly requested level", () => {
    const npc = generateNpc({ occupation: "innkeeper", level: 9, seed: "explicit" });
    expect(npc.level).toBe(9);
    expect(npc.statBlock.level).toBe(9);
  });

  it("stat block level always matches the NPC level", () => {
    for (let i = 0; i < 40; i++) {
      const npc = generateNpc({ seed: `match-${i}` });
      expect(npc.statBlock.level).toBe(npc.level);
    }
  });
});

describe("statBlockToMarkdown", () => {
  it("renders the expected stat-block sections", () => {
    const sb = generateStatBlock({ level: 4, role: "soldier", seed: "md" });
    const md = statBlockToMarkdown(sb, "Kessa", ["lawful good", "human", "humanoid"]);
    expect(md).toContain("Kessa — Creature 4");
    expect(md).toContain("**Perception**");
    expect(md).toContain("**AC**");
    expect(md).toContain("**HP**");
    expect(md).toContain("**Speed**");
    expect(md).toMatch(/\*\*(Melee|Ranged)\*\*/);
    expect(md).toContain("**Damage**");
  });

  it("includes spellcasting only for casters", () => {
    const caster = generateStatBlock({ level: 9, role: "caster", seed: "sc" });
    expect(statBlockToMarkdown(caster, "Vex")).toMatch(/Spellcasting/);
    const brute = generateStatBlock({ level: 9, role: "brute", seed: "sc" });
    expect(statBlockToMarkdown(brute, "Grok")).not.toMatch(/Spellcasting/);
  });
});

describe("NPC integration", () => {
  it("every generated NPC carries a usable stat block", () => {
    for (let i = 0; i < 25; i++) {
      const npc = generateNpc({ seed: `npc-sb-${i}` });
      expect(npc.statBlock).toBeDefined();
      expect(npc.statBlock.level).toBe(npc.level);
      expect(npc.statBlock.ac).toBeGreaterThan(8);
      expect(npc.statBlock.attacks.length).toBeGreaterThan(0);
    }
  });

  it("no longer emits a placeholder stat block", () => {
    const md = npcToMarkdown(generateNpc({ seed: "no-placeholder" }));
    expect(md).not.toMatch(/placeholder/i);
    expect(md).toContain("## Stat block");
    expect(md).toContain("**AC**");
  });

  it("respects an explicit role override", () => {
    const npc = generateNpc({ occupation: "innkeeper", role: "brute", seed: "override" });
    expect(npc.statBlock.role).toBe("brute");
  });
});
