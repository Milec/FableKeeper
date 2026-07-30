import { describe, expect, it } from "vitest";
import {
  abilityModifier,
  deriveClassDc,
  deriveCoins,
  deriveEquipment,
  deriveFeats,
  deriveLores,
  derivePerception,
  deriveSaves,
  deriveSheet,
  deriveSkills,
  deriveSpellcasting,
  formatModifier,
  RANK_LABELS,
  SKILLS,
} from "./sheet";
import { parsePathbuilder } from "./pathbuilder";
import type { Character } from "@/types/database";

const abilities = { str: 18, dex: 12, con: 14, int: 10, wis: 14, cha: 16 };

describe("abilityModifier", () => {
  it("follows the PF2E table", () => {
    expect(abilityModifier(10)).toBe(0);
    expect(abilityModifier(11)).toBe(0);
    expect(abilityModifier(12)).toBe(1);
    expect(abilityModifier(18)).toBe(4);
    expect(abilityModifier(8)).toBe(-1);
    expect(abilityModifier(7)).toBe(-2);
  });

  it("treats missing scores as +0", () => {
    expect(abilityModifier(undefined)).toBe(0);
  });
});

describe("formatModifier", () => {
  it("signs the number", () => {
    expect(formatModifier(3)).toBe("+3");
    expect(formatModifier(0)).toBe("+0");
    expect(formatModifier(-1)).toBe("-1");
  });
});

describe("deriveSkills", () => {
  it("covers all 16 PF2E skills", () => {
    const skills = deriveSkills(5, abilities, {});
    expect(skills).toHaveLength(16);
    expect(SKILLS.map((s) => s.key)).toContain("thievery");
  });

  it("gives untrained skills no level bonus", () => {
    // Untrained Acrobatics at level 5 with Dex +1 is just +1, not +6.
    const skills = deriveSkills(5, abilities, {});
    const acro = skills.find((s) => s.key === "acrobatics")!;
    expect(acro.rank).toBe(0);
    expect(acro.modifier).toBe(1);
  });

  it("applies level + rank + ability for trained skills", () => {
    // Athletics: expert (4) at level 5 with Str +4 → 5 + 4 + 4 = 13.
    const skills = deriveSkills(5, abilities, { proficiencies: { athletics: 4 } });
    const ath = skills.find((s) => s.key === "athletics")!;
    expect(ath.rank).toBe(4);
    expect(ath.modifier).toBe(13);
  });

  it("labels ranks", () => {
    expect(RANK_LABELS[2]).toBe("Trained");
    expect(RANK_LABELS[8]).toBe("Legendary");
  });
});

describe("deriveSaves / derivePerception", () => {
  it("computes saves from level, rank, and ability", () => {
    // Fortitude expert (4), level 5, Con +2 → 11.
    const saves = deriveSaves(5, abilities, { proficiencies: { fortitude: 4 } });
    expect(saves.find((s) => s.key === "fortitude")!.modifier).toBe(11);
    // Untrained Will still gets the level bonus (saves are always proficient).
    expect(saves.find((s) => s.key === "will")!.modifier).toBe(5 + 0 + 2);
  });

  it("computes perception", () => {
    const per = derivePerception(3, abilities, { proficiencies: { perception: 4 } });
    expect(per.modifier).toBe(3 + 4 + 2);
  });
});

describe("deriveClassDc", () => {
  it("is 10 + level + rank + key ability", () => {
    const dc = deriveClassDc(5, abilities, {
      proficiencies: { classDC: 4 },
      keyAbility: "str",
    });
    expect(dc).toBe(10 + 5 + 4 + 4);
  });

  it("returns null with nothing to go on", () => {
    expect(deriveClassDc(5, abilities, {})).toBeNull();
  });
});

describe("Pathbuilder-shaped data", () => {
  it("reads lores as [name, rank] tuples", () => {
    const lores = deriveLores(5, abilities, { lores: [["Warfare", 2]] });
    expect(lores).toHaveLength(1);
    expect(lores[0]).toMatchObject({ label: "Warfare Lore", rank: 2 });
    expect(lores[0]!.modifier).toBe(5 + 2 + 0); // Int +0
  });

  it("reads equipment as [name, qty] tuples", () => {
    const eq = deriveEquipment({ equipment: [["Breastplate", 1], ["Rations", 4]] });
    expect(eq).toEqual([
      { name: "Breastplate", quantity: 1 },
      { name: "Rations", quantity: 4 },
    ]);
  });

  it("reads feats from tuples or strings", () => {
    expect(deriveFeats({ feats: [["Power Attack", "", "Class Feat", 1], "Toughness"] })).toEqual([
      "Power Attack",
      "Toughness",
    ]);
  });

  it("summarises spellcasting", () => {
    const casting = deriveSpellcasting({
      spellCasters: [
        {
          name: "Cleric Font",
          magicTradition: "divine",
          ability: "wis",
          spells: [
            { spellLevel: 0, list: ["light", "guidance"] },
            { spellLevel: 1, list: ["bless"] },
          ],
        },
      ],
    });
    expect(casting).toHaveLength(1);
    expect(casting[0]!.tradition).toBe("divine");
    expect(casting[0]!.spellsByRank.map((g) => g.rank)).toEqual(["Cantrips", "Rank 1"]);
    expect(casting[0]!.spellsByRank[0]!.spells).toContain("light");
  });

  it("defaults coins to zero", () => {
    expect(deriveCoins({})).toEqual({ pp: 0, gp: 0, sp: 0, cp: 0 });
    expect(deriveCoins({ coins: { gp: 12, sp: 3 } })).toMatchObject({ gp: 12, sp: 3, cp: 0 });
  });

  it("survives junk without throwing", () => {
    const junk = {
      lores: "nope",
      equipment: 42,
      feats: null,
      spellCasters: [{}, "bad"],
      languages: [1, "Common"],
      proficiencies: { athletics: "expert" },
    } as never;
    expect(() => deriveLores(1, abilities, junk)).not.toThrow();
    expect(deriveEquipment(junk)).toEqual([]);
    expect(deriveFeats(junk)).toEqual([]);
    // A non-numeric rank falls back to untrained rather than NaN.
    const skills = deriveSkills(5, abilities, junk);
    expect(skills.find((s) => s.key === "athletics")!.rank).toBe(0);
  });
});

describe("deriveSheet end to end", () => {
  /** Build a Character row from a Pathbuilder payload, as the importer does. */
  function characterFromPathbuilder(): Character {
    const parsed = parsePathbuilder({
      build: {
        name: "Seelah",
        class: "Champion",
        level: 5,
        ancestry: "Human",
        keyability: "str",
        languages: ["Common", "Celestial"],
        attributes: { ancestryhp: 8, classhp: 10, bonushp: 0, bonushpPerLevel: 0, speed: 25 },
        abilities: { str: 18, dex: 12, con: 14, int: 10, wis: 14, cha: 16 },
        proficiencies: { classDC: 4, perception: 4, fortitude: 6, reflex: 4, will: 4, athletics: 4, religion: 2 },
        feats: [["Deity's Domain", "", "Champion Feat", 1]],
        lores: [["Warfare", 2]],
        equipment: [["Breastplate", 1]],
        spellCasters: [],
        acTotal: { acTotal: 22 },
      },
    });
    return {
      id: "c1",
      campaign_id: "camp",
      owner_id: "u1",
      name: parsed.name,
      ancestry: parsed.ancestry ?? null,
      heritage: null,
      background: null,
      class: parsed.class ?? null,
      level: parsed.level,
      key_ability: parsed.keyAbility ?? null,
      portrait_url: null,
      abilities: parsed.abilities as never,
      defenses: parsed.defenses as never,
      data: parsed.data as never,
      created_at: "",
      updated_at: "",
    };
  }

  it("derives a complete sheet from an imported character", () => {
    const sheet = deriveSheet(characterFromPathbuilder());

    expect(sheet.level).toBe(5);
    // Fortitude master (6) + level 5 + Con +2 = 13
    expect(sheet.saves.find((s) => s.key === "fortitude")!.modifier).toBe(13);
    // Athletics expert (4) + level 5 + Str +4 = 13
    expect(sheet.skills.find((s) => s.key === "athletics")!.modifier).toBe(13);
    // Religion trained (2) + level 5 + Wis +2 = 9
    expect(sheet.skills.find((s) => s.key === "religion")!.modifier).toBe(9);
    // Untrained Thievery is just Dex +1
    expect(sheet.skills.find((s) => s.key === "thievery")!.modifier).toBe(1);
    expect(sheet.perception.modifier).toBe(5 + 4 + 2);
    expect(sheet.classDc).toBe(10 + 5 + 4 + 4);
    expect(sheet.lores.map((l) => l.label)).toEqual(["Warfare Lore"]);
    expect(sheet.feats).toEqual(["Deity's Domain"]);
    expect(sheet.languages).toEqual(["Common", "Celestial"]);
    expect(sheet.equipment).toEqual([{ name: "Breastplate", quantity: 1 }]);
    expect(sheet.defenses.ac).toBe(22);
    expect(sheet.defenses.hp_max).toBe(68);
  });

  it("handles a bare manually-created character", () => {
    const sheet = deriveSheet({
      id: "c2",
      campaign_id: "camp",
      owner_id: "u1",
      name: "Blank",
      ancestry: null,
      heritage: null,
      background: null,
      class: null,
      level: 1,
      key_ability: null,
      portrait_url: null,
      abilities: {} as never,
      defenses: {} as never,
      data: {} as never,
      created_at: "",
      updated_at: "",
    });
    expect(sheet.skills).toHaveLength(16);
    expect(sheet.saves).toHaveLength(3);
    expect(sheet.feats).toEqual([]);
    expect(sheet.classDc).toBeNull();
    expect(sheet.coins).toEqual({ pp: 0, gp: 0, sp: 0, cp: 0 });
  });
});
