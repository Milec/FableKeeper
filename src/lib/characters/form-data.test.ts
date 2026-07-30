import { describe, expect, it } from "vitest";
import {
  readCoins,
  readEquipment,
  readFeats,
  readList,
  readLores,
  readProficiencies,
  readSheetData,
} from "./form-data";

/** Build a FormData from a plain object, the way the character form submits. */
function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("readProficiencies", () => {
  it("keeps valid PF2E ranks and drops anything else", () => {
    const fd = form({
      proficiencies: JSON.stringify({
        athletics: 4,
        perception: 0,
        stealth: 3,
        arcana: "trained",
        classDC: 8,
      }),
    });
    expect(readProficiencies(fd)).toEqual({
      athletics: 4,
      perception: 0,
      classDC: 8,
    });
  });

  it("returns an empty map for missing or malformed JSON", () => {
    expect(readProficiencies(form({}))).toEqual({});
    expect(readProficiencies(form({ proficiencies: "{oops" }))).toEqual({});
  });
});

describe("readLores", () => {
  it("normalises [name, rank] tuples and clamps bad ranks to untrained", () => {
    const fd = form({
      lores: JSON.stringify([["  Warfare  ", 4], ["Absalom", 5], ["", 2], "junk"],),
    });
    expect(readLores(fd)).toEqual([
      ["Warfare", 4],
      ["Absalom", 0],
    ]);
  });
});

describe("readFeats", () => {
  it("writes plain names when there is nothing stored", () => {
    const fd = form({ feats: JSON.stringify(["Power Attack", "  ", "Sudden Charge"]) });
    expect(readFeats(fd)).toEqual(["Power Attack", "Sudden Charge"]);
  });

  it("preserves an imported feat's full tuple when the name is unchanged", () => {
    // Pathbuilder stores [name, source, type, level]; the editor only shows the
    // name, so a naive write-back would flatten away the rest.
    const previous = [
      ["Power Attack", null, "Fighter Feat", 1],
      ["Sudden Charge", null, "Fighter Feat", 1],
    ];
    const fd = form({ feats: JSON.stringify(["Power Attack", "Toughness"]) });
    expect(readFeats(fd, previous)).toEqual([
      ["Power Attack", null, "Fighter Feat", 1],
      // Newly typed, so there is no metadata to keep.
      "Toughness",
    ]);
  });

  it("drops a removed feat rather than resurrecting it from the previous list", () => {
    const previous = [["Power Attack", null, "Fighter Feat", 1]];
    expect(readFeats(form({ feats: "[]" }), previous)).toEqual([]);
  });
});

describe("readEquipment", () => {
  it("emits Pathbuilder [name, quantity] tuples", () => {
    const fd = form({
      equipment: JSON.stringify([["Longsword", 1], ["Rations", 7], ["", 3]]),
    });
    expect(readEquipment(fd)).toEqual([
      ["Longsword", 1],
      ["Rations", 7],
    ]);
  });

  it("keeps extra imported slots while still applying the edited quantity", () => {
    const previous = [["Longsword", 1, "Invested", "held"]];
    const fd = form({ equipment: JSON.stringify([["Longsword", 3]]) });
    expect(readEquipment(fd, previous)).toEqual([
      ["Longsword", 3, "Invested", "held"],
    ]);
  });

  it("floors and bounds nonsense quantities", () => {
    const fd = form({
      equipment: JSON.stringify([["Arrow", 2.7], ["Rock", -5], ["Coin", 1e9]]),
    });
    expect(readEquipment(fd)).toEqual([
      ["Arrow", 2],
      ["Rock", 1],
      ["Coin", 9999],
    ]);
  });
});

describe("readCoins and readList", () => {
  it("drops zero and negative coin amounts", () => {
    const fd = form({ coin_pp: "0", coin_gp: "35", coin_sp: "-2", coin_cp: "" });
    expect(readCoins(fd)).toEqual({ gp: 35 });
  });

  it("splits, trims, and de-duplicates comma-separated lists", () => {
    const fd = form({ languages: " Common , Elven ,Common,  " });
    expect(readList(fd, "languages")).toEqual(["Common", "Elven"]);
    expect(readList(fd, "missing")).toEqual([]);
  });
});

describe("readSheetData", () => {
  it("bounds XP and hero points, defaulting blanks to zero", () => {
    const data = readSheetData(form({ xp: "4000", heroPoints: "9" }), {
      keyAbility: null,
    });
    expect(data.xp).toBe(1000);
    expect(data.heroPoints).toBe(3);

    const blank = readSheetData(form({}), { keyAbility: null });
    expect(blank.xp).toBe(0);
    expect(blank.heroPoints).toBe(0);
  });

  it("merges editor ranks over proficiencies the editor does not manage", () => {
    // Armour, weapon, and spellcasting proficiencies come from a Pathbuilder
    // import and have no UI, so an edit must not wipe them.
    const data = readSheetData(
      form({ proficiencies: JSON.stringify({ athletics: 4 }) }),
      {
        keyAbility: "str",
        prevProficiencies: {
          athletics: 2,
          heavy: 4,
          martial: 6,
          castingDivine: 4,
        },
      },
    );
    expect(data.proficiencies).toEqual({
      athletics: 4, // editor wins for keys it owns
      heavy: 4,
      martial: 6,
      castingDivine: 4,
    });
  });

  it("records the key ability so Class DC derives for hand-built characters", () => {
    expect(readSheetData(form({}), { keyAbility: "cha" }).keyAbility).toBe("cha");
    expect(readSheetData(form({}), { keyAbility: null }).keyAbility).toBeNull();
  });

  it("clears the deity when the field is left blank", () => {
    expect(readSheetData(form({}), { keyAbility: null }).deity).toBeNull();
    expect(
      readSheetData(form({}), { keyAbility: null, deity: "Iomedae" }).deity,
    ).toBe("Iomedae");
  });
});
