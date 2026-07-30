/**
 * Turns a parsed Azgaar map into World Builder entry drafts.
 *
 * The point of the importer is not to dump data — it is to produce articles a GM
 * would actually want to read and then edit. So each draft:
 *
 * - uses the entry type that matches what the thing *is* (a Monarchy becomes a
 *   Kingdom, a ruins marker becomes a Ruin, a cave becomes a Dungeon),
 * - opens with a short prose summary rather than a stat dump,
 * - **cross-links with `[[wiki links]]`**, so importing a map immediately gives
 *   you a connected wiki: a city links to its kingdom, province, culture, and
 *   religion, and those link back through the existing backlink system, and
 * - ends with a "hooks" section left deliberately empty, because that is what
 *   the GM is going to fill in.
 *
 * Everything here is pure so the mapping decisions are unit-testable without a
 * database.
 */

import { slugify } from "@/lib/utils";
import type { WorldEntryType } from "@/types/database";
import type {
  AzgaarBurg,
  AzgaarCulture,
  AzgaarMap,
  AzgaarMarker,
  AzgaarProvince,
  AzgaarReligion,
  AzgaarRiver,
  AzgaarState,
  AzgaarZone,
} from "./azgaar";

/** A world entry ready to be inserted. */
export interface EntryDraft {
  type: WorldEntryType;
  title: string;
  slug: string;
  summary: string;
  tags: string[];
  markdown: string;
  /** Which import group produced it, for the preview and the toggles. */
  group: ImportGroup;
}

export const IMPORT_GROUPS = [
  "states",
  "provinces",
  "burgs",
  "cultures",
  "religions",
  "rivers",
  "markers",
  "zones",
] as const;

export type ImportGroup = (typeof IMPORT_GROUPS)[number];

export const GROUP_LABELS: Record<ImportGroup, string> = {
  states: "States & kingdoms",
  provinces: "Provinces",
  burgs: "Cities & villages",
  cultures: "Cultures",
  religions: "Religions",
  rivers: "Rivers",
  markers: "Landmarks & sites",
  zones: "Zones",
};

/**
 * A capital is always a city; otherwise population decides. Azgaar has no
 * town/city distinction of its own, and 2,000 is roughly where a medieval
 * settlement stops reading as a village.
 */
const CITY_POPULATION_THRESHOLD = 2000;

/**
 * Azgaar marker types that describe somewhere you can go *into*, which maps far
 * better onto Dungeon than onto Landmark.
 */
const DUNGEON_MARKERS = new Set([
  "caves",
  "dungeons",
  "rifts",
  "portals",
  "necropolises",
  "disturbed-burials",
  "mines",
]);

/** Human-readable names for FMG's marker type slugs. */
const MARKER_LABELS: Record<string, string> = {
  volcanoes: "Volcano",
  "hot-springs": "Hot Spring",
  "water-sources": "Spring",
  mines: "Mine",
  bridges: "Bridge",
  inns: "Inn",
  lighthouses: "Lighthouse",
  waterfalls: "Waterfall",
  battlefields: "Battlefield",
  dungeons: "Dungeon",
  "lake-monsters": "Lake Monster",
  "sea-monsters": "Sea Monster",
  "hill-monsters": "Hill Monster",
  "sacred-mountains": "Sacred Mountain",
  "sacred-forests": "Sacred Forest",
  "sacred-pineries": "Sacred Pinery",
  "sacred-palm-groves": "Sacred Palm Grove",
  brigands: "Brigand Camp",
  pirates: "Pirate Haven",
  statues: "Statue",
  ruins: "Ruin",
  libraries: "Library",
  circuses: "Circus",
  jousts: "Tournament Ground",
  fairs: "Fair",
  canoes: "Portage",
  migration: "Migration Route",
  dances: "Ritual Ground",
  mirage: "Mirage",
  caves: "Cave",
  portals: "Portal",
  rifts: "Rift",
  "disturbed-burials": "Disturbed Burial",
  necropolises: "Necropolis",
  encounters: "Encounter Site",
};

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** `[[Title]]`, or plain text when the target wasn't imported. */
function link(title: string | null | undefined): string | null {
  return title ? `[[${title}]]` : null;
}

function formatNumber(n: number | null): string | null {
  return n === null ? null : n.toLocaleString("en-US");
}

/** A markdown definition list of the facts that are actually known. */
function factList(facts: [string, string | null][]): string {
  const known = facts.filter((f): f is [string, string] => Boolean(f[1]));
  if (!known.length) return "";
  return known.map(([label, value]) => `- **${label}:** ${value}`).join("\n");
}

function section(heading: string, body: string): string {
  return body.trim() ? `## ${heading}\n\n${body.trim()}` : "";
}

function joinSections(parts: (string | null)[]): string {
  return parts.filter((p) => p && p.trim()).join("\n\n") + "\n";
}

/**
 * A marker's real name lives in the map's notes (`marker3` → "Mount Tother"),
 * not on the marker object, which usually carries only an icon and a type. Fall
 * back to a numbered type label so several caves don't collide.
 */
function markerTitle(marker: AzgaarMarker, noteName: string | null): string {
  if (marker.name) return marker.name;
  if (noteName) return noteName;
  const label = marker.type ? (MARKER_LABELS[marker.type] ?? titleCase(marker.type)) : "Site";
  return `${label} ${marker.id}`;
}

function titleCase(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Name resolution
//
// Cross-links are by title, so every builder needs to look up the display title
// of a related entity by its Azgaar id. Titles are resolved once up front.
// ---------------------------------------------------------------------------

interface NameIndex {
  states: Map<number, string>;
  provinces: Map<number, string>;
  burgs: Map<number, string>;
  cultures: Map<number, string>;
  religions: Map<number, string>;
  rivers: Map<number, string>;
}

function buildNameIndex(map: AzgaarMap): NameIndex {
  const index = <T extends { id: number; name: string }>(items: T[]) =>
    new Map(items.map((i) => [i.id, i.name]));
  return {
    states: index(map.states),
    provinces: index(map.provinces),
    burgs: index(map.burgs),
    cultures: index(map.cultures),
    religions: index(map.religions),
    rivers: index(map.rivers),
  };
}

// ---------------------------------------------------------------------------
// Per-entity builders
// ---------------------------------------------------------------------------

/** Monarchies become Kingdoms; every other government form becomes a Nation. */
export function entryTypeForState(state: AzgaarState): WorldEntryType {
  return state.form === "Monarchy" ? "kingdom" : "nation";
}

/** Capitals and anything above the population threshold are cities. */
export function entryTypeForBurg(burg: AzgaarBurg): WorldEntryType {
  if (burg.isCapital) return "city";
  return (burg.population ?? 0) >= CITY_POPULATION_THRESHOLD ? "city" : "village";
}

export function entryTypeForMarker(marker: AzgaarMarker): WorldEntryType {
  if (!marker.type) return "landmark";
  if (marker.type === "ruins") return "ruin";
  return DUNGEON_MARKERS.has(marker.type) ? "dungeon" : "landmark";
}

function buildState(state: AzgaarState, names: NameIndex): EntryDraft {
  const type = entryTypeForState(state);
  const capital = link(
    state.capitalId !== null ? names.burgs.get(state.capitalId) : null,
  );
  const culture = link(
    state.cultureId !== null ? names.cultures.get(state.cultureId) : null,
  );
  const provinces = state.provinceIds
    .map((id) => link(names.provinces.get(id)))
    .filter((l): l is string => Boolean(l));

  const label = state.formName ?? state.form ?? (type === "kingdom" ? "kingdom" : "state");
  const summary = `${state.fullName ?? state.name} — a ${label.toLowerCase()}${
    state.population !== null ? ` of about ${formatNumber(state.population)} people` : ""
  }.`;

  const markdown = joinSections([
    section(
      "Overview",
      factList([
        ["Full name", state.fullName],
        ["Government", state.formName ?? state.form],
        ["Capital", capital],
        ["Dominant culture", culture],
        ["Population", formatNumber(state.population)],
        ["Territory", state.area !== null ? `${formatNumber(state.area)} sq. units` : null],
        ["Settlements", formatNumber(state.burgCount)],
      ]),
    ),
    provinces.length ? section("Provinces", provinces.map((p) => `- ${p}`).join("\n")) : null,
    section("Foreign relations", describeDiplomacy(state, names)),
    section("Plot hooks", "-"),
  ]);

  return {
    type,
    title: state.name,
    slug: slugify(state.name),
    summary,
    tags: ["azgaar", type, ...(state.form ? [state.form.toLowerCase()] : [])],
    markdown,
    group: "states",
  };
}

/**
 * FMG stores diplomacy as an array indexed by state id, so entry `n` is this
 * state's stance toward state `n`. Self and neutral entries carry no meaning.
 */
function describeDiplomacy(state: AzgaarState, names: NameIndex): string {
  const lines: string[] = [];
  state.diplomacy.forEach((stance, otherId) => {
    if (otherId === state.id || otherId === 0) return;
    if (!stance || stance === "x" || stance === "Neutral") return;
    const other = names.states.get(otherId);
    if (!other) return;
    lines.push(`- **${stance}** — ${link(other)}`);
  });
  return lines.join("\n");
}

function buildProvince(province: AzgaarProvince, names: NameIndex): EntryDraft {
  const state = link(
    province.stateId !== null ? names.states.get(province.stateId) : null,
  );
  const seat = link(province.burgId !== null ? names.burgs.get(province.burgId) : null);

  return {
    type: "province",
    title: province.name,
    slug: slugify(province.name),
    summary: `${province.fullName ?? province.name}${
      state ? ` — a province of ${province.stateId !== null ? names.states.get(province.stateId) : ""}` : ""
    }.`.replace(/\s+\./g, "."),
    tags: ["azgaar", "province"],
    markdown: joinSections([
      section(
        "Overview",
        factList([
          ["Full name", province.fullName],
          ["Type", province.formName],
          ["State", state],
          ["Seat", seat],
          ["Population", formatNumber(province.population)],
          ["Area", province.area !== null ? `${formatNumber(province.area)} sq. units` : null],
        ]),
      ),
      section("Plot hooks", "-"),
    ]),
    group: "provinces",
  };
}

function buildBurg(burg: AzgaarBurg, names: NameIndex, notes: AzgaarMap["notes"]): EntryDraft {
  const type = entryTypeForBurg(burg);
  const state = link(burg.stateId !== null ? names.states.get(burg.stateId) : null);
  const province = link(
    burg.provinceId !== null ? names.provinces.get(burg.provinceId) : null,
  );
  const culture = link(burg.cultureId !== null ? names.cultures.get(burg.cultureId) : null);
  const religion = link(
    burg.religionId !== null ? names.religions.get(burg.religionId) : null,
  );

  // FMG's structural flags are the closest thing it has to describing a place,
  // so they become prose the GM can build on rather than a row of booleans.
  const features: string[] = [];
  if (burg.hasWalls) features.push("is walled");
  if (burg.hasCitadel) features.push("is guarded by a citadel");
  if (burg.hasTemple) features.push("holds a major temple");
  if (burg.hasPlaza) features.push("has a market plaza");
  if (burg.isPort) features.push("works as a seaport");
  if (burg.hasShantyTown) features.push("has grown a shanty town outside its walls");

  const descriptor = burg.isCapital
    ? `the capital${state ? " of " + (burg.stateId !== null ? names.states.get(burg.stateId) : "") : ""}`
    : type === "city"
      ? "a city"
      : "a village";
  const summary = `${burg.name} is ${descriptor}${
    burg.population !== null ? `, home to roughly ${formatNumber(burg.population)} people` : ""
  }.`;

  const note = notes.get(`burg${burg.id}`);

  return {
    type,
    title: burg.name,
    slug: slugify(burg.name),
    summary,
    tags: [
      "azgaar",
      type,
      ...(burg.isCapital ? ["capital"] : []),
      ...(burg.isPort ? ["port"] : []),
    ],
    markdown: joinSections([
      section(
        "Overview",
        factList([
          ["Population", formatNumber(burg.population)],
          ["State", state],
          ["Province", province],
          ["Culture", culture],
          ["Religion", religion],
          ["Status", burg.isCapital ? "Capital" : null],
        ]),
      ),
      features.length
        ? section(
            "The settlement",
            `${burg.name} ${joinWithAnd(features)}.`,
          )
        : null,
      note?.legend ? section("Notes from the map", note.legend) : null,
      burg.mfcgLink
        ? section("City map", `[Open the generated city plan](${burg.mfcgLink})`)
        : null,
      section("Notable figures", "-"),
      section("Plot hooks", "-"),
    ]),
    group: "burgs",
  };
}

function joinWithAnd(parts: string[]): string {
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function buildCulture(culture: AzgaarCulture, names: NameIndex): EntryDraft {
  const parents = culture.origins
    .map((id) => link(names.cultures.get(id)))
    .filter((l): l is string => Boolean(l));

  return {
    type: "culture",
    title: culture.name,
    slug: slugify(culture.name),
    summary: `The ${culture.name} culture${
      culture.type ? ` — a ${culture.type.toLowerCase()} people` : ""
    }${culture.population !== null ? `, numbering about ${formatNumber(culture.population)}` : ""}.`,
    tags: ["azgaar", "culture", ...(culture.type ? [culture.type.toLowerCase()] : [])],
    markdown: joinSections([
      section(
        "Overview",
        factList([
          ["Way of life", culture.type],
          ["Population", formatNumber(culture.population)],
          ["Homeland", culture.area !== null ? `${formatNumber(culture.area)} sq. units` : null],
          ["Descended from", parents.join(", ") || null],
        ]),
      ),
      // Azgaar supplies no cultural detail beyond type and spread, so these are
      // prompts rather than generated filler.
      section("Customs & daily life", "-"),
      section("Language & naming", "-"),
      section("Relations with neighbours", "-"),
    ]),
    group: "cultures",
  };
}

function buildReligion(religion: AzgaarReligion, names: NameIndex): EntryDraft {
  const culture = link(
    religion.cultureId !== null ? names.cultures.get(religion.cultureId) : null,
  );

  return {
    type: "religion",
    title: religion.name,
    slug: slugify(religion.name),
    summary: `${religion.name}${religion.form ? ` — ${religion.form.toLowerCase()}` : ""}${
      religion.deity ? `, centred on ${religion.deity}` : ""
    }.`,
    tags: ["azgaar", "religion", ...(religion.type ? [religion.type.toLowerCase()] : [])],
    markdown: joinSections([
      section(
        "Overview",
        factList([
          ["Type", religion.type],
          ["Form", religion.form],
          ["Deity", religion.deity],
          ["Originating culture", culture],
          ["Spread", religion.expansion],
          ["Followers", formatNumber(religion.population)],
        ]),
      ),
      section("Beliefs & tenets", "-"),
      section("Clergy & holy sites", "-"),
      section("Plot hooks", "-"),
    ]),
    group: "religions",
  };
}

function buildRiver(river: AzgaarRiver, names: NameIndex): EntryDraft {
  const parent =
    river.parentId !== null && river.parentId !== river.id
      ? link(names.rivers.get(river.parentId))
      : null;

  return {
    type: "landmark",
    title: river.name,
    slug: slugify(river.name),
    summary: `${river.name}${river.type ? `, a ${river.type.toLowerCase()}` : ""}${
      river.length !== null ? `, running some ${formatNumber(Math.round(river.length))} units` : ""
    }.`,
    tags: ["azgaar", "river"],
    markdown: joinSections([
      section(
        "Overview",
        factList([
          ["Type", river.type],
          ["Length", river.length !== null ? formatNumber(Math.round(river.length)) : null],
          ["Mouth width", river.width !== null ? formatNumber(river.width) : null],
          ["Discharge", river.discharge !== null ? `${formatNumber(river.discharge)} m³/s` : null],
          ["Tributary of", parent],
        ]),
      ),
      section("Along its course", "-"),
    ]),
    group: "rivers",
  };
}

function buildMarker(marker: AzgaarMarker, notes: AzgaarMap["notes"]): EntryDraft {
  const type = entryTypeForMarker(marker);
  // FMG generates a name and legend for most markers; the legend is genuine
  // flavour text and the best content this importer can carry over, so it leads
  // the article.
  const note = notes.get(`marker${marker.id}`);
  const title = markerTitle(marker, note?.name ?? null);
  const label = marker.type ? (MARKER_LABELS[marker.type] ?? titleCase(marker.type)) : null;

  return {
    type,
    title,
    slug: slugify(title),
    summary: label ? `${label} marked on the map.` : "A site marked on the map.",
    tags: ["azgaar", type, ...(marker.type ? [marker.type] : [])],
    markdown: joinSections([
      note?.legend ? section("Overview", note.legend) : null,
      section("Details", factList([["Type", label]])),
      section("Plot hooks", "-"),
    ]),
    group: "markers",
  };
}

function buildZone(zone: AzgaarZone): EntryDraft {
  return {
    type: "region",
    title: zone.name,
    slug: slugify(zone.name),
    summary: `${zone.name}${zone.type ? ` — ${zone.type.toLowerCase()}` : ""}.`,
    tags: ["azgaar", "zone", ...(zone.type ? [slugify(zone.type)] : [])],
    markdown: joinSections([
      section("Overview", factList([["Kind", zone.type]])),
      section("What is happening here", "-"),
    ]),
    group: "zones",
  };
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export interface BuildOptions {
  /** Which groups to import. Omit to import everything. */
  groups?: readonly ImportGroup[];
  /** Skip settlements below this population. Capitals are always kept. */
  minBurgPopulation?: number;
}

/**
 * Build every entry draft for a map, deduplicating slugs.
 *
 * Azgaar happily reuses a name across a burg and a province (a province is often
 * named after its seat), and two rivers can share a name. Entry slugs must be
 * unique per world, so later collisions get a `-2` suffix rather than being
 * dropped — losing a real place to a name clash would be worse than a slightly
 * ugly slug.
 */
export function buildEntryDrafts(map: AzgaarMap, options: BuildOptions = {}): EntryDraft[] {
  const groups = new Set<ImportGroup>(options.groups ?? IMPORT_GROUPS);
  const minPop = options.minBurgPopulation ?? 0;
  const names = buildNameIndex(map);
  const drafts: EntryDraft[] = [];

  if (groups.has("states")) {
    for (const state of map.states) drafts.push(buildState(state, names));
  }
  if (groups.has("provinces")) {
    for (const province of map.provinces) drafts.push(buildProvince(province, names));
  }
  if (groups.has("burgs")) {
    for (const burg of map.burgs) {
      if (!burg.isCapital && (burg.population ?? 0) < minPop) continue;
      drafts.push(buildBurg(burg, names, map.notes));
    }
  }
  if (groups.has("cultures")) {
    for (const culture of map.cultures) drafts.push(buildCulture(culture, names));
  }
  if (groups.has("religions")) {
    for (const religion of map.religions) drafts.push(buildReligion(religion, names));
  }
  if (groups.has("rivers")) {
    for (const river of map.rivers) drafts.push(buildRiver(river, names));
  }
  if (groups.has("markers")) {
    for (const marker of map.markers) drafts.push(buildMarker(marker, map.notes));
  }
  if (groups.has("zones")) {
    for (const zone of map.zones) drafts.push(buildZone(zone));
  }

  return dedupeSlugs(drafts);
}

function dedupeSlugs(drafts: EntryDraft[]): EntryDraft[] {
  const seen = new Map<string, number>();
  return drafts.map((draft) => {
    // An entity whose name slugifies to nothing (e.g. only punctuation) still
    // needs a usable slug.
    const base = draft.slug || slugify(draft.type);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? { ...draft, slug: base } : { ...draft, slug: `${base}-${count + 1}` };
  });
}

/** Per-group counts for the import preview. */
export function summarizeMap(map: AzgaarMap): Record<ImportGroup, number> {
  return {
    states: map.states.length,
    provinces: map.provinces.length,
    burgs: map.burgs.length,
    cultures: map.cultures.length,
    religions: map.religions.length,
    rivers: map.rivers.length,
    markers: map.markers.length,
    zones: map.zones.length,
  };
}
