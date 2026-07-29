import { describe, expect, it } from "vitest";
import { parsePathbuilder, PathbuilderParseError } from "./pathbuilder";

const SAMPLE = {
  success: true,
  build: {
    name: "Seelah",
    class: "Champion",
    level: 5,
    ancestry: "Human",
    heritage: "Skilled Heritage",
    background: "Acolyte",
    alignment: "LG",
    deity: "Iomedae",
    keyability: "str",
    languages: ["Common", "Celestial"],
    attributes: {
      ancestryhp: 8,
      classhp: 10,
      bonushp: 0,
      bonushpPerLevel: 0,
      speed: 25,
      speedBonus: 0,
    },
    abilities: { str: 18, dex: 12, con: 14, int: 10, wis: 14, cha: 16 },
    proficiencies: { classDC: 6, perception: 4, fortitude: 6 },
    feats: [
      ["Deity's Domain", "", "Champion Feat", 1],
      ["Ranged Reprisal", "", "Champion Feat", 4],
    ],
    lores: [["Warfare", 2]],
    equipment: [["Breastplate", 1]],
    acTotal: { acTotal: 22 },
  },
};

describe("parsePathbuilder", () => {
  it("maps core identity fields", () => {
    const c = parsePathbuilder(SAMPLE);
    expect(c.name).toBe("Seelah");
    expect(c.class).toBe("Champion");
    expect(c.level).toBe(5);
    expect(c.ancestry).toBe("Human");
    expect(c.heritage).toBe("Skilled Heritage");
    expect(c.background).toBe("Acolyte");
    expect(c.keyAbility).toBe("str");
  });

  it("maps ability scores", () => {
    const c = parsePathbuilder(SAMPLE);
    expect(c.abilities).toMatchObject({ str: 18, con: 14, cha: 16 });
  });

  it("computes max HP from PF2E formula", () => {
    // ancestry 8 + (class 10 + conMod 2 + 0) * level 5 = 8 + 60 = 68
    const c = parsePathbuilder(SAMPLE);
    expect(c.defenses.hp_max).toBe(68);
    expect(c.defenses.hp_current).toBe(68);
  });

  it("reads AC and speed", () => {
    const c = parsePathbuilder(SAMPLE);
    expect(c.defenses.ac).toBe(22);
    expect(c.defenses.speed).toBe(25);
  });

  it("extracts feat names from tuples", () => {
    const c = parsePathbuilder(SAMPLE);
    expect(c.data.feats).toEqual(["Deity's Domain", "Ranged Reprisal"]);
  });

  it("accepts a JSON string", () => {
    const c = parsePathbuilder(JSON.stringify(SAMPLE));
    expect(c.name).toBe("Seelah");
  });

  it("accepts a bare build object", () => {
    const c = parsePathbuilder(SAMPLE.build);
    expect(c.name).toBe("Seelah");
  });

  it("defaults level to 1 when missing", () => {
    const c = parsePathbuilder({ build: { name: "Nmeer", abilities: {} } });
    expect(c.level).toBe(1);
  });

  it("throws on invalid JSON", () => {
    expect(() => parsePathbuilder("{not json")).toThrow(PathbuilderParseError);
  });

  it("throws when there is no name", () => {
    expect(() => parsePathbuilder({ build: { level: 3 } })).toThrow(
      PathbuilderParseError,
    );
  });
});
