import { describe, expect, it } from "vitest";
import { AzgaarParseError, compactAzgaarExport, parseAzgaarMap } from "./azgaar";
import {
  buildEntryDrafts,
  entryTypeForBurg,
  entryTypeForMarker,
  entryTypeForState,
  summarizeMap,
} from "./entries";
import demo from "./__fixtures__/azgaar-demo.json";

/**
 * The fixture is a trimmed slice of a **real** Azgaar 1.112 export (its own
 * `tests/fixtures/demo.map`), not a hand-written approximation. That matters:
 * writing this suite against invented data would have missed that markers and
 * zones are 0-indexed while states and cultures are not, and that a marker's
 * name lives in the map notes rather than on the marker.
 */
const map = parseAzgaarMap(JSON.stringify(demo));

describe("parseAzgaarMap", () => {
  it("reads the map metadata", () => {
    expect(map.info.version).toBe("1.112.1");
    expect(map.info.mapName).toBe("Demo");
    expect(map.info.seed).toBe("135111970");
    expect(map.info.width).toBe(1680);
  });

  it("skips the placeholder entities that mean 'unclaimed'", () => {
    // states[0] "Neutrals", cultures[0] "Wildlands", religions[0] "No religion"
    expect(map.states.map((s) => s.name)).toEqual(["Lohia", "Gazd", "Tetelilco"]);
    expect(map.cultures.map((c) => c.name)).toEqual(["Valadi", "Tinshui", "Trover"]);
    expect(map.religions.map((r) => r.name)).toEqual([
      "Valadi Ancestors",
      "Tinshui Beliefs",
    ]);
    expect(map.states.some((s) => s.name === "Neutrals")).toBe(false);
  });

  it("keeps markers and zones, which are genuinely 0-indexed", () => {
    // A blanket skip-id-0 rule would silently drop the first of each.
    expect(map.markers).toHaveLength(3);
    expect(map.markers[0]!.id).toBe(0);
    expect(map.zones).toHaveLength(2);
    expect(map.zones[0]!.name).toBe("Tetelilcan Incursion");
  });

  it("ignores the literal 0 that pads burgs, provinces, and features", () => {
    expect(map.burgs.map((b) => b.name)).toEqual([
      "Longong",
      "Krar",
      "Yuengyaumun",
      "Rineiguro",
      "Ehriedt",
    ]);
    expect(map.provinces).toHaveLength(3);
  });

  it("scales burg population by the map's rates", () => {
    // Longong stores 15.067 with populationRate 1000, urbanization 1.
    const longong = map.burgs.find((b) => b.name === "Longong")!;
    expect(longong.population).toBe(15067);
    expect(longong.isCapital).toBe(true);
    expect(longong.hasWalls).toBe(true);
    expect(longong.hasCitadel).toBe(true);
    // shanty is 0 in the export, which means absent rather than falsy-unknown.
    expect(longong.hasShantyTown).toBe(false);
    expect(longong.hasTemple).toBe(false);
  });

  it("combines rural and urban counts for states", () => {
    // Lohia: rural 3416.17 + urban 354.435, both at rate 1000.
    const lohia = map.states.find((s) => s.name === "Lohia")!;
    expect(lohia.population).toBe(3770605);
    expect(lohia.form).toBe("Theocracy");
    expect(lohia.fullName).toBe("Lohian Theocracy");
    expect(lohia.capitalId).toBe(1);
  });

  it("reads religion detail", () => {
    const folk = map.religions.find((r) => r.name === "Valadi Ancestors")!;
    expect(folk.type).toBe("Folk");
    expect(folk.form).toBe("Ancestor Worship");
    expect(folk.deity).toBe("Bacsete, The Yellow Goat");
    expect(folk.expansion).toBe("culture");
    expect(folk.cultureId).toBe(1);
  });

  it("drops origin 0, which means 'no parent culture'", () => {
    const valadi = map.cultures.find((c) => c.name === "Valadi")!;
    expect(valadi.origins).toEqual([]);
    expect(valadi.type).toBe("Generic");
  });

  it("indexes map notes by their object id", () => {
    expect(map.notes.get("marker0")?.name).toBe("Chishambe Volcano");
    expect(map.notes.get("marker0")?.legend).toContain("Erupting volcano");
  });

  it("leaves burg province and religion null without a Full export's cells", () => {
    // A burg never carries these; they live in the per-cell arrays.
    expect(map.burgs.every((b) => b.religionId === null)).toBe(true);
  });

  it("recovers burg province and religion from a Full export's cells", () => {
    const full = parseAzgaarMap(
      JSON.stringify({
        ...demo,
        pack: {
          ...demo.pack,
          cells: [{ i: 4589, province: 1, religion: 2 }],
        },
      }),
    );
    const longong = full.burgs.find((b) => b.name === "Longong")!;
    expect(longong.cell).toBe(4589);
    expect(longong.provinceId).toBe(1);
    expect(longong.religionId).toBe(2);
  });

  it("rejects input that isn't an Azgaar export", () => {
    expect(() => parseAzgaarMap("")).toThrow(AzgaarParseError);
    expect(() => parseAzgaarMap("not json")).toThrow(/valid JSON/);
    expect(() => parseAzgaarMap("[1,2,3]")).toThrow(/JSON object/);
    expect(() => parseAzgaarMap(JSON.stringify({ info: {}, pack: {} }))).toThrow(
      /No map data/,
    );
  });

  it("points a .map save file at the right export option", () => {
    expect(() => parseAzgaarMap("1.112.1|File can be loaded in azgaar…")).toThrow(
      /not the \.map save file/,
    );
  });

  it("counts each group for the preview", () => {
    expect(summarizeMap(map)).toEqual({
      states: 3,
      provinces: 3,
      burgs: 5,
      cultures: 3,
      religions: 2,
      rivers: 3,
      markers: 3,
      zones: 2,
    });
  });
});

describe("entry type mapping", () => {
  it("makes monarchies kingdoms and everything else a nation", () => {
    expect(entryTypeForState({ form: "Monarchy" } as never)).toBe("kingdom");
    expect(entryTypeForState({ form: "Theocracy" } as never)).toBe("nation");
    expect(entryTypeForState({ form: null } as never)).toBe("nation");
  });

  it("sizes settlements by capital status then population", () => {
    expect(entryTypeForBurg({ isCapital: true, population: 40 } as never)).toBe("city");
    expect(entryTypeForBurg({ isCapital: false, population: 9000 } as never)).toBe("city");
    expect(entryTypeForBurg({ isCapital: false, population: 5000 } as never)).toBe("city");
    // The median burg on a generated map is ~3,700, so this must stay a village.
    expect(entryTypeForBurg({ isCapital: false, population: 3700 } as never)).toBe("village");
    expect(entryTypeForBurg({ isCapital: false, population: 400 } as never)).toBe("village");
    expect(entryTypeForBurg({ isCapital: false, population: null } as never)).toBe("village");
  });

  it("routes markers you can enter to Dungeon, and ruins to Ruin", () => {
    expect(entryTypeForMarker({ type: "caves" } as never)).toBe("dungeon");
    expect(entryTypeForMarker({ type: "necropolises" } as never)).toBe("dungeon");
    expect(entryTypeForMarker({ type: "ruins" } as never)).toBe("ruin");
    expect(entryTypeForMarker({ type: "bridges" } as never)).toBe("landmark");
    expect(entryTypeForMarker({ type: null } as never)).toBe("landmark");
  });
});

describe("buildEntryDrafts", () => {
  const drafts = buildEntryDrafts(map);
  // Azgaar reuses a name across a burg and the province it seats, so lookups
  // have to say which one they mean.
  const byTitle = (title: string, group?: string) =>
    drafts.find((d) => d.title === title && (!group || d.group === group))!;

  it("produces one draft per entity across every group", () => {
    expect(drafts).toHaveLength(3 + 3 + 5 + 3 + 2 + 3 + 3 + 2);
  });

  it("cross-links a city to its state, culture, and province", () => {
    const longong = byTitle("Longong", "burgs");
    expect(longong.type).toBe("city");
    // Longong is state 1 (Lohia) and culture 2 (Tinshui).
    expect(longong.markdown).toContain("[[Lohia]]");
    expect(longong.markdown).toContain("[[Tinshui]]");
    expect(longong.summary).toContain("the capital of Lohia");
    expect(longong.summary).toContain("15,067");
  });

  it("describes a settlement's structures as prose", () => {
    const longong = byTitle("Longong", "burgs");
    expect(longong.markdown).toMatch(/is walled.*citadel|citadel.*is walled/s);
    // Absent flags must not be described.
    expect(longong.markdown).not.toContain("shanty town");
  });

  it("titles a state entry and records its government", () => {
    const lohia = byTitle("Lohia");
    expect(lohia.type).toBe("nation");
    expect(lohia.markdown).toContain("Lohian Theocracy");
    expect(lohia.markdown).toContain("**Capital:** [[Longong]]");
  });

  it("lists only meaningful diplomatic stances", () => {
    const lohia = byTitle("Lohia");
    const relations = lohia.markdown.slice(lohia.markdown.indexOf("Foreign relations"));
    // Lohia's own slot and neutral/unknown stances carry no information.
    expect(relations).not.toContain("[[Lohia]]");
    expect(relations).not.toContain("Neutral");
    expect(relations).toContain("Enemy");
  });

  it("names a marker from the map notes and keeps its legend", () => {
    const volcano = byTitle("Chishambe Volcano");
    expect(volcano.type).toBe("landmark");
    expect(volcano.markdown).toContain("Erupting volcano");
    expect(volcano.tags).toContain("volcanoes");
  });

  it("gives a religion its deity and originating culture", () => {
    const faith = byTitle("Valadi Ancestors");
    expect(faith.type).toBe("religion");
    expect(faith.markdown).toContain("Bacsete, The Yellow Goat");
    expect(faith.markdown).toContain("[[Valadi]]");
  });

  it("turns zones into regions", () => {
    const zone = byTitle("Tetelilcan Incursion");
    expect(zone.type).toBe("region");
    expect(zone.markdown).toContain("Invasion");
  });

  it("respects the group filter", () => {
    const only = buildEntryDrafts(map, { groups: ["cultures", "religions"] });
    expect(only).toHaveLength(5);
    expect(new Set(only.map((d) => d.group))).toEqual(
      new Set(["cultures", "religions"]),
    );
  });

  it("drops small settlements below the threshold but keeps capitals", () => {
    // Yuengyaumun (8,066) clears a 7,000 floor; Rineiguro and Ehriedt do not.
    const filtered = buildEntryDrafts(map, {
      groups: ["burgs"],
      minBurgPopulation: 7000,
    });
    expect(filtered.map((d) => d.title)).toEqual([
      "Longong",
      "Krar",
      "Yuengyaumun",
    ]);

    // Capitals are kept no matter how high the floor goes.
    const capitalsOnly = buildEntryDrafts(map, {
      groups: ["burgs"],
      minBurgPopulation: 1_000_000,
    });
    expect(capitalsOnly.map((d) => d.title)).toEqual(["Longong", "Krar"]);
  });

  it("keeps both entries when a province is named after its seat", () => {
    // Azgaar names a province after its seat burg, so "Longong" collides.
    const slugs = drafts.filter((d) => d.slug.startsWith("longong")).map((d) => d.slug);
    expect(slugs).toEqual(["longong", "longong-2"]);
  });

  it("gives every draft a usable slug and a summary", () => {
    for (const draft of drafts) {
      expect(draft.slug).toMatch(/^[a-z0-9-]+$/);
      expect(draft.summary.trim()).not.toBe("");
      expect(draft.title.trim()).not.toBe("");
      expect(draft.tags).toContain("azgaar");
    }
  });

  it("never emits an empty heading or a stray 'null' in the body", () => {
    for (const draft of drafts) {
      expect(draft.markdown).not.toContain("null");
      expect(draft.markdown).not.toContain("undefined");
      expect(draft.markdown).not.toMatch(/##\s*\n\s*\n##/);
    }
  });
});

describe("compactAzgaarExport", () => {
  it("strips the bulk while keeping everything the importer reads", () => {
    // A Full export is mostly grid, cells, vertices, and coats of arms.
    const bulky = {
      ...demo,
      grid: { cells: Array.from({ length: 5000 }, (_, i) => ({ i, h: 40, temp: 20 })) },
      nameBases: Array.from({ length: 200 }, () => "padding".repeat(50)),
      pack: {
        ...demo.pack,
        vertices: Array.from({ length: 5000 }, (_, i) => ({ i, p: [1, 2], v: [1, 2, 3] })),
        cells: [
          { i: 4589, province: 1, religion: 2, h: 40, biome: 5, pop: 3 },
          // A cell with no burg carries nothing the importer needs.
          { i: 99, province: 7, religion: 7 },
        ],
      },
    };
    const raw = JSON.stringify(bulky);
    const compacted = compactAzgaarExport(raw);

    expect(compacted.length).toBeLessThan(raw.length / 4);

    const map = parseAzgaarMap(compacted);
    // Every entity still parses…
    expect(summarizeMap(map)).toEqual(summarizeMap(parseAzgaarMap(raw)));
    // …and the burg's cell-derived links survive, which is the whole reason the
    // cell array is reduced rather than dropped.
    const longong = map.burgs.find((b) => b.name === "Longong")!;
    expect(longong.provinceId).toBe(1);
    expect(longong.religionId).toBe(2);
  });

  it("keeps only the cells that hold a burg", () => {
    const burgCells = map.burgs.map((b) => b.cell!);
    const compacted = JSON.parse(
      compactAzgaarExport(
        JSON.stringify({
          ...demo,
          pack: {
            ...demo.pack,
            cells: [
              ...burgCells.map((i) => ({ i, province: 1, religion: 1 })),
              // 500 cells with no burg on them, which carry nothing we need.
              ...Array.from({ length: 500 }, (_, n) => ({ i: 900_000 + n, province: 2 })),
            ],
          },
        }),
      ),
    );
    expect(compacted.pack.cells).toHaveLength(burgCells.length);
    expect(compacted.pack.cells.map((c: { i: number }) => c.i).sort()).toEqual(
      [...burgCells].sort(),
    );
  });

  it("preserves the notes that name markers", () => {
    const compacted = parseAzgaarMap(compactAzgaarExport(JSON.stringify(demo)));
    expect(compacted.notes.get("marker0")?.name).toBe("Chishambe Volcano");
  });

  it("reports unreadable input before anything is uploaded", () => {
    expect(() => compactAzgaarExport("nope")).toThrow(AzgaarParseError);
    expect(() => compactAzgaarExport("[1,2]")).toThrow(/JSON object/);
  });
});
