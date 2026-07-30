/**
 * Parser for Azgaar's Fantasy Map Generator JSON exports.
 *
 * FMG's "Export to JSON" offers four shapes (see its `services/io/export-json.ts`):
 *
 * - **Full** — `{info, settings, mapCoordinates, pack, grid, notes, nameBases}`
 * - **Minimal** — the same minus `grid` and the per-cell arrays
 * - **PackCells** / **GridCells** — `{info, cells}` only
 *
 * Everything this importer needs lives under `pack` (or `cells` for the
 * cell-only exports), so Full and Minimal are both accepted and Minimal is the
 * one worth recommending: it carries every entity at a fraction of the size.
 *
 * Field names here are FMG's own — terse (`i`, `coa`, `pop`) because they mirror
 * its typed arrays. They are normalised into readable shapes on the way out so
 * nothing downstream has to know FMG's conventions.
 *
 * Three conventions must be honoured or the import loses or invents entries.
 * These were each verified against a real 1.112 export rather than assumed:
 *
 * 1. **Index 0 is a placeholder in *some* collections only.** `states[0]` is
 *    `{i: 0, name: "Neutrals"}`, `cultures[0]` is `"Wildlands"`, and
 *    `religions[0]` is `"No religion"` — all meaning "unclaimed", all skipped.
 *    `burgs[0]`, `provinces[0]`, and `features[0]` are the literal number `0`.
 *    But **`markers[0]` and `zones[0]` are real entities**, so a blanket
 *    skip-id-0 rule silently drops the first marker and the first zone.
 * 2. **`removed: true` entries stay in the array.** FMG tombstones deleted
 *    entities to keep ids stable, so they must be filtered out too.
 * 3. **A burg does not know its province or religion.** Unlike `state` and
 *    `culture`, those live only in the per-cell arrays, so they are recovered
 *    from `pack.cells` when a Full export supplies them and are simply absent
 *    from a Minimal one. Province is additionally recoverable either way,
 *    because a province names its seat burg.
 *
 * Populations are stored scaled: the real figure is
 * `population * populationRate * urbanization` for urban counts, using the
 * rates from `settings`.
 */

export class AzgaarParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AzgaarParseError";
  }
}

// ---------------------------------------------------------------------------
// The subset of FMG's export we read
// ---------------------------------------------------------------------------

interface RawEntity {
  i?: unknown;
  name?: unknown;
  removed?: unknown;
}

export interface AzgaarMapInfo {
  version: string | null;
  mapName: string | null;
  seed: string | null;
  width: number | null;
  height: number | null;
  exportedAt: string | null;
}

export interface AzgaarCulture {
  id: number;
  name: string;
  type: string | null;
  /** Ids of the cultures this one descends from, per FMG's `origins`. */
  origins: number[];
  cells: number | null;
  area: number | null;
  /** Total people, already scaled by the map's population rates. */
  population: number | null;
  color: string | null;
}

export interface AzgaarState {
  id: number;
  name: string;
  /** FMG's `fullName`, e.g. "Kingdom of Aldoria". */
  fullName: string | null;
  /** Government form: Monarchy, Republic, Theocracy, Union, Anarchy. */
  form: string | null;
  /** The specific form, e.g. "Grand Duchy". */
  formName: string | null;
  capitalId: number | null;
  cultureId: number | null;
  provinceIds: number[];
  neighborIds: number[];
  /** Per-neighbour diplomatic stance, indexed by state id in FMG. */
  diplomacy: string[];
  cells: number | null;
  area: number | null;
  burgCount: number | null;
  population: number | null;
  color: string | null;
}

export interface AzgaarProvince {
  id: number;
  name: string;
  fullName: string | null;
  formName: string | null;
  stateId: number | null;
  /** The province's seat, as a burg id. */
  burgId: number | null;
  area: number | null;
  population: number | null;
  color: string | null;
}

export interface AzgaarBurg {
  id: number;
  name: string;
  stateId: number | null;
  cultureId: number | null;
  provinceId: number | null;
  religionId: number | null;
  /** Real population in people, scaled by the map's rates. */
  population: number | null;
  isCapital: boolean;
  isPort: boolean;
  /** FMG's structural flags — 0/undefined means absent. */
  hasCitadel: boolean;
  hasWalls: boolean;
  hasPlaza: boolean;
  hasTemple: boolean;
  hasShantyTown: boolean;
  x: number | null;
  y: number | null;
  cell: number | null;
  /** Link to the Medieval Fantasy City Generator, when FMG recorded one. */
  mfcgLink: string | null;
}

export interface AzgaarReligion {
  id: number;
  name: string;
  /** Folk, Organized, Cult, or Heresy. */
  type: string | null;
  /** The specific form, e.g. "Polytheism". */
  form: string | null;
  deity: string | null;
  cultureId: number | null;
  /** How the faith spread: "global", "state", or "culture". */
  expansion: string | null;
  population: number | null;
  color: string | null;
}

export interface AzgaarRiver {
  id: number;
  name: string;
  type: string | null;
  /** Length in the map's distance unit. */
  length: number | null;
  /** Discharge in m³/s. */
  discharge: number | null;
  /** Mouth width in the map's distance unit. */
  width: number | null;
  parentId: number | null;
  basinId: number | null;
}

export interface AzgaarMarker {
  id: number;
  /** FMG's marker type slug, e.g. "ruins", "caves", "battlefields". */
  type: string | null;
  name: string | null;
  x: number | null;
  y: number | null;
  cell: number | null;
}

export interface AzgaarZone {
  id: number;
  name: string;
  type: string | null;
  cellCount: number;
  color: string | null;
}

/** A geographic feature: an island, a lake, or an ocean. */
export interface AzgaarFeature {
  id: number;
  name: string | null;
  type: string | null;
  /** FMG's size band, e.g. "isle", "continent", "freshwater". */
  group: string | null;
  cells: number | null;
  area: number | null;
}

export interface AzgaarMap {
  info: AzgaarMapInfo;
  /** FMG's note bodies, keyed by the object they annotate (e.g. `burg12`). */
  notes: Map<string, { name: string; legend: string }>;
  cultures: AzgaarCulture[];
  states: AzgaarState[];
  provinces: AzgaarProvince[];
  burgs: AzgaarBurg[];
  religions: AzgaarReligion[];
  rivers: AzgaarRiver[];
  markers: AzgaarMarker[];
  zones: AzgaarZone[];
  features: AzgaarFeature[];
}

// ---------------------------------------------------------------------------
// Coercion helpers
//
// Exports come from a long-lived generator whose fields have shifted between
// versions, so every read is defensive: a missing or malformed field yields null
// rather than throwing, and the import proceeds with what it can read.
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function str(value: unknown): string | null {
  if (typeof value === "string") {
    const t = value.trim();
    return t ? t : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/** FMG uses 0 / undefined for "absent" on its structural flags. */
function flag(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const n = num(value);
  return n !== null && n > 0;
}

function numArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map(num).filter((n): n is number => n !== null);
}

function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

/**
 * Entities worth importing: real objects, not tombstoned, and — where the
 * collection uses one — not the index-0 placeholder.
 *
 * `skipZero` must be set per collection. Markers and zones are genuinely
 * 0-indexed; states, cultures, and religions reserve 0 for "unclaimed".
 * Returns `[id, record]` pairs so callers don't re-read `i`.
 */
function realEntities(
  value: unknown,
  { skipZero }: { skipZero: boolean },
): [number, Record<string, unknown>][] {
  if (!Array.isArray(value)) return [];
  const out: [number, Record<string, unknown>][] = [];
  for (const entry of value) {
    const rec = asRecord(entry);
    if (!rec) continue;
    const raw = rec as RawEntity;
    if (raw.removed === true) continue;
    const id = num(raw.i);
    if (id === null) continue;
    if (skipZero && id === 0) continue;
    out.push([id, rec]);
  }
  return out;
}

/**
 * Province and religion per cell, from a Full export's `pack.cells`.
 *
 * Only these two are extracted: everything else a burg needs it already carries,
 * and the cell array is by far the largest part of the file.
 */
interface CellLookup {
  province: Map<number, number>;
  religion: Map<number, number>;
}

function readCellLookup(value: unknown): CellLookup {
  const lookup: CellLookup = { province: new Map(), religion: new Map() };
  if (!Array.isArray(value)) return lookup;
  for (const entry of value) {
    const rec = asRecord(entry);
    if (!rec) continue;
    const id = num(rec.i);
    if (id === null) continue;
    const province = num(rec.province);
    if (province !== null && province > 0) lookup.province.set(id, province);
    const religion = num(rec.religion);
    if (religion !== null && religion > 0) lookup.religion.set(id, religion);
  }
  return lookup;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Population rates from `settings`. FMG stores rural and urban counts scaled
 * down; multiplying restores people. Defaults match FMG's own defaults so a
 * cells-only export still produces sane numbers.
 */
interface Rates {
  populationRate: number;
  urbanization: number;
}

function readRates(settings: Record<string, unknown> | null): Rates {
  const populationRate = num(settings?.populationRate);
  const urbanization = num(settings?.urbanization);
  return {
    populationRate: populationRate && populationRate > 0 ? populationRate : 1000,
    urbanization: urbanization && urbanization > 0 ? urbanization : 1,
  };
}

/** Total people for an entity carrying FMG's split rural/urban counts. */
function totalPopulation(rec: Record<string, unknown>, rates: Rates): number | null {
  const rural = num(rec.rural);
  const urban = num(rec.urban);
  if (rural === null && urban === null) return null;
  const people =
    (rural ?? 0) * rates.populationRate +
    (urban ?? 0) * rates.populationRate * rates.urbanization;
  return Math.round(people);
}

export function parseAzgaarMap(input: string | unknown): AzgaarMap {
  let root: unknown = input;
  if (typeof input === "string") {
    if (!input.trim()) throw new AzgaarParseError("The file is empty.");
    try {
      root = JSON.parse(input);
    } catch {
      throw new AzgaarParseError(
        "That isn't valid JSON. Use Azgaar's Export → JSON (Full or Minimal), not the .map save file.",
      );
    }
  }

  const doc = asRecord(root);
  if (!doc) throw new AzgaarParseError("Expected a JSON object at the top level.");

  // Full and Minimal exports nest entities under `pack`; the cell-only exports
  // use `cells`. Fall back to the root so a bare entity object still parses.
  const pack = asRecord(doc.pack) ?? asRecord(doc.cells) ?? doc;
  const info = asRecord(doc.info);
  const settings = asRecord(doc.settings);
  const rates = readRates(settings);
  // Present only in a Full export; a Minimal one simply yields empty lookups.
  const cellLookup = readCellLookup(pack.cells);

  const hasAnyEntities = [
    "burgs",
    "states",
    "cultures",
    "religions",
    "provinces",
    "rivers",
    "markers",
    "zones",
  ].some((key) => Array.isArray(pack[key]));

  if (!hasAnyEntities) {
    throw new AzgaarParseError(
      "No map data found. Export from Azgaar with Export → JSON (Minimal or Full) — the Cells-only exports don't include cultures, burgs, or states.",
    );
  }

  return {
    info: {
      version: str(info?.version),
      // `mapName` appears in both info and settings depending on version.
      mapName: str(info?.mapName) ?? str(settings?.mapName),
      seed: str(info?.seed),
      width: num(info?.width),
      height: num(info?.height),
      exportedAt: str(info?.exportedAt),
    },
    notes: parseNotes(doc.notes),
    cultures: parseCultures(pack.cultures, rates),
    states: parseStates(pack.states, rates),
    provinces: parseProvinces(pack.provinces, rates),
    burgs: parseBurgs(pack.burgs, rates, cellLookup),
    religions: parseReligions(pack.religions, rates),
    rivers: parseRivers(pack.rivers),
    markers: parseMarkers(pack.markers),
    zones: parseZones(pack.zones),
    features: parseFeatures(pack.features),
  };
}

/** FMG's `notes` array: `{id, name, legend}` where id is e.g. `burg12`. */
function parseNotes(value: unknown): AzgaarMap["notes"] {
  const out = new Map<string, { name: string; legend: string }>();
  if (!Array.isArray(value)) return out;
  for (const entry of value) {
    const rec = asRecord(entry);
    const id = str(rec?.id);
    if (!rec || !id) continue;
    out.set(id, {
      name: str(rec.name) ?? id,
      legend: typeof rec.legend === "string" ? rec.legend : "",
    });
  }
  return out;
}

function parseCultures(value: unknown, rates: Rates): AzgaarCulture[] {
  // cultures[0] is "Wildlands".
  return realEntities(value, { skipZero: true }).map(([id, rec]) => ({
    id,
    name: str(rec.name) ?? `Culture ${id}`,
    type: str(rec.type),
    // `origins` may contain null for "no parent"; numArray drops those.
    origins: numArray(rec.origins).filter((o) => o !== 0),
    cells: num(rec.cells),
    area: num(rec.area),
    population: totalPopulation(rec, rates),
    color: str(rec.color),
  }));
}

function parseStates(value: unknown, rates: Rates): AzgaarState[] {
  // states[0] is "Neutrals".
  return realEntities(value, { skipZero: true }).map(([id, rec]) => ({
    id,
    name: str(rec.name) ?? `State ${id}`,
    fullName: str(rec.fullName),
    form: str(rec.form),
    formName: str(rec.formName),
    capitalId: num(rec.capital),
    cultureId: num(rec.culture),
    provinceIds: numArray(rec.provinces),
    neighborIds: numArray(rec.neighbors),
    diplomacy: strArray(rec.diplomacy),
    cells: num(rec.cells),
    area: num(rec.area),
    burgCount: num(rec.burgs),
    population: totalPopulation(rec, rates),
    color: str(rec.color),
  }));
}

function parseProvinces(value: unknown, rates: Rates): AzgaarProvince[] {
  // provinces[0] is the literal 0, which asRecord already rejects.
  return realEntities(value, { skipZero: true }).map(([id, rec]) => ({
    id,
    name: str(rec.name) ?? `Province ${id}`,
    fullName: str(rec.fullName),
    formName: str(rec.formName),
    stateId: num(rec.state),
    burgId: num(rec.burg),
    area: num(rec.area),
    population: totalPopulation(rec, rates),
    color: str(rec.color),
  }));
}

function parseBurgs(value: unknown, rates: Rates, cells: CellLookup): AzgaarBurg[] {
  // burgs[0] is the literal 0, which asRecord already rejects.
  return realEntities(value, { skipZero: true }).map(([id, rec]) => {
    // A burg's `population` is a single scaled figure, not a rural/urban split.
    const cell = num(rec.cell);
    const raw = num(rec.population);
    const population =
      raw === null
        ? null
        : Math.round(raw * rates.populationRate * rates.urbanization);
    return {
      id,
      name: str(rec.name) ?? `Burg ${id}`,
      stateId: num(rec.state),
      cultureId: num(rec.culture),
      // Not stored on the burg: recovered from the cell it occupies, so these
      // are null for a Minimal export.
      provinceId: num(rec.province) ?? (cell !== null ? cells.province.get(cell) ?? null : null),
      religionId: num(rec.religion) ?? (cell !== null ? cells.religion.get(cell) ?? null : null),
      population,
      isCapital: flag(rec.capital),
      isPort: flag(rec.port),
      hasCitadel: flag(rec.citadel),
      hasWalls: flag(rec.walls),
      hasPlaza: flag(rec.plaza),
      hasTemple: flag(rec.temple),
      hasShantyTown: flag(rec.shanty),
      x: num(rec.x),
      y: num(rec.y),
      cell,
      mfcgLink: str(rec.MFCG) ?? str(rec.link),
    };
  });
}

function parseReligions(value: unknown, rates: Rates): AzgaarReligion[] {
  // religions[0] is "No religion".
  return realEntities(value, { skipZero: true }).map(([id, rec]) => ({
    id,
    name: str(rec.name) ?? `Religion ${id}`,
    type: str(rec.type),
    form: str(rec.form),
    deity: str(rec.deity),
    cultureId: num(rec.culture),
    expansion: str(rec.expansion),
    population: totalPopulation(rec, rates),
    color: str(rec.color),
  }));
}

function parseRivers(value: unknown): AzgaarRiver[] {
  // Rivers have no placeholder; ids start wherever the generator left off.
  return realEntities(value, { skipZero: false }).map(([id, rec]) => ({
    id,
    name: str(rec.name) ?? `River ${id}`,
    type: str(rec.type),
    length: num(rec.length),
    discharge: num(rec.discharge),
    width: num(rec.width),
    parentId: num(rec.parent),
    basinId: num(rec.basin),
  }));
}

function parseMarkers(value: unknown): AzgaarMarker[] {
  // markers[0] is a real marker.
  return realEntities(value, { skipZero: false }).map(([id, rec]) => ({
    id,
    type: str(rec.type),
    name: str(rec.name),
    x: num(rec.x),
    y: num(rec.y),
    cell: num(rec.cell),
  }));
}

function parseZones(value: unknown): AzgaarZone[] {
  // zones[0] is a real zone.
  return realEntities(value, { skipZero: false }).map(([id, rec]) => ({
    id,
    name: str(rec.name) ?? `Zone ${id}`,
    type: str(rec.type),
    cellCount: numArray(rec.cells).length,
    color: str(rec.color),
  }));
}

/**
 * Features are the only collection where index 0 is genuinely absent (FMG stores
 * a literal `0`), and unnamed water bodies are common, so they get their own
 * filter rather than reusing `realEntities`.
 */
function parseFeatures(value: unknown): AzgaarFeature[] {
  if (!Array.isArray(value)) return [];
  const out: AzgaarFeature[] = [];
  for (const entry of value) {
    const rec = asRecord(entry);
    if (!rec) continue;
    const id = num(rec.i);
    if (id === null || id === 0) continue;
    out.push({
      id,
      name: str(rec.name),
      type: str(rec.type),
      group: str(rec.group),
      cells: num(rec.cells),
      area: num(rec.area),
    });
  }
  return out;
}
