/**
 * Pure parsers that turn the character form's `FormData` into the shape stored
 * in `characters.data`.
 *
 * These live apart from `actions.ts` so they can be unit-tested without a
 * Supabase client, and because the merge rules below are the subtle part: the
 * form's editors expose less than a Pathbuilder import stores, so a naive
 * write-back silently destroys imported data. Every helper here is written to
 * preserve what it does not own.
 */

export const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;

/** The proficiency ranks PF2E actually uses. */
const VALID_RANKS = new Set([0, 2, 4, 6, 8]);

/** Parse a hidden JSON field, returning `fallback` on anything unexpected. */
export function readJson<T>(formData: FormData, field: string, fallback: T): T {
  const raw = formData.get(field);
  if (typeof raw !== "string" || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function readAbilities(formData: FormData): Record<string, number> {
  const abilities: Record<string, number> = {};
  for (const key of ABILITY_KEYS) {
    const raw = formData.get(`ability_${key}`);
    const n = typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
    if (Number.isFinite(n)) abilities[key] = n;
  }
  return abilities;
}

export function readDefenses(formData: FormData): Record<string, number> {
  const defenses: Record<string, number> = {};
  for (const key of ["ac", "hp_max", "hp_current", "speed"] as const) {
    const raw = formData.get(`def_${key}`);
    const n = typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
    if (Number.isFinite(n)) defenses[key] = n;
  }
  return defenses;
}

/** Coin purse from the wealth fields; zeroes are dropped. */
export function readCoins(formData: FormData): Record<string, number> {
  const coins: Record<string, number> = {};
  for (const key of ["pp", "gp", "sp", "cp"] as const) {
    const raw = formData.get(`coin_${key}`);
    const n = typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
    if (Number.isFinite(n) && n > 0) coins[key] = n;
  }
  return coins;
}

/** Proficiency ranks from the rank editor, clamped to valid PF2E ranks. */
export function readProficiencies(formData: FormData): Record<string, number> {
  const raw = readJson<Record<string, unknown>>(formData, "proficiencies", {});
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "number" && VALID_RANKS.has(value)) out[key] = value;
  }
  return out;
}

/** Lore skills as Pathbuilder-compatible [name, rank] tuples. */
export function readLores(formData: FormData): [string, number][] {
  const out: [string, number][] = [];
  for (const entry of readJson<unknown[]>(formData, "lores", [])) {
    if (!Array.isArray(entry)) continue;
    const name = typeof entry[0] === "string" ? entry[0].trim() : "";
    const rank = typeof entry[1] === "number" && VALID_RANKS.has(entry[1]) ? entry[1] : 0;
    if (name) out.push([name.slice(0, 60), rank]);
  }
  return out.slice(0, 30);
}

/**
 * Index a stored Pathbuilder list by the name in its first slot.
 *
 * Pathbuilder stores richer entries than the editors expose — a feat is
 * `[name, source, type, level]` and equipment tuples can carry extra slots. The
 * editors only round-trip the name (and quantity), so an unchanged row is
 * written back from the original entry rather than flattened.
 */
function indexByName(previous: unknown): Map<string, unknown> {
  const map = new Map<string, unknown>();
  if (!Array.isArray(previous)) return map;
  for (const entry of previous) {
    const name = Array.isArray(entry)
      ? typeof entry[0] === "string"
        ? entry[0]
        : null
      : typeof entry === "string"
        ? entry
        : null;
    if (name && !map.has(name)) map.set(name, entry);
  }
  return map;
}

/** Feats, keeping each imported entry intact when its name is unchanged. */
export function readFeats(formData: FormData, previous?: unknown): unknown[] {
  const known = indexByName(previous);
  return readJson<unknown[]>(formData, "feats", [])
    .filter((f): f is string => typeof f === "string" && f.trim().length > 0)
    .map((f) => f.trim().slice(0, 120))
    .slice(0, 200)
    .map((name) => known.get(name) ?? name);
}

/** Equipment as Pathbuilder-compatible [name, quantity] tuples. */
export function readEquipment(formData: FormData, previous?: unknown): unknown[] {
  const known = indexByName(previous);
  const out: unknown[] = [];
  for (const entry of readJson<unknown[]>(formData, "equipment", [])) {
    if (!Array.isArray(entry)) continue;
    const name = typeof entry[0] === "string" ? entry[0].trim().slice(0, 120) : "";
    if (!name) continue;
    const qty = Math.min(
      typeof entry[1] === "number" && entry[1] > 0 ? Math.floor(entry[1]) : 1,
      9999,
    );
    // Reuse the imported tuple so extra slots survive; only quantity changes.
    const prev = known.get(name);
    if (Array.isArray(prev) && prev.length > 2) {
      const merged = [...prev];
      merged[1] = qty;
      out.push(merged);
    } else {
      out.push([name, qty]);
    }
  }
  return out.slice(0, 300);
}

/** A bounded integer field, or undefined when blank. */
export function readInt(
  formData: FormData,
  field: string,
  min: number,
  max: number,
): number | undefined {
  const raw = formData.get(field);
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(min, Math.min(max, n));
}

/** Split a comma-separated field into a trimmed, de-duplicated list. */
export function readList(formData: FormData, field: string): string[] {
  const raw = formData.get(field);
  if (typeof raw !== "string") return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ].slice(0, 40);
}

/** PF2E awards a level every 1,000 XP; the form tracks progress within a level. */
const XP_PER_LEVEL = 1000;

export interface SheetDataContext {
  deity?: string;
  keyAbility: string | null;
  /** Existing `data` values, so an edit preserves what the editors don't expose. */
  prevProficiencies?: Record<string, unknown>;
  prevFeats?: unknown;
  prevEquipment?: unknown;
}

/** The fields of `characters.data` the character form owns, ready to merge. */
export function readSheetData(formData: FormData, ctx: SheetDataContext) {
  const notes = formData.get("notes");
  return {
    notes: typeof notes === "string" ? notes : "",
    // Mirrored from the column so Class DC derivation works the same way for
    // hand-built characters as it does for Pathbuilder imports.
    keyAbility: ctx.keyAbility,
    coins: readCoins(formData),
    languages: readList(formData, "languages"),
    conditions: readList(formData, "conditions"),
    // Merged, not replaced: a Pathbuilder import also stores armour, weapon,
    // and spellcasting proficiencies in this map, and the rank editor only
    // manages the skills, saves, Perception, and Class DC.
    proficiencies: { ...ctx.prevProficiencies, ...readProficiencies(formData) },
    lores: readLores(formData),
    feats: readFeats(formData, ctx.prevFeats),
    equipment: readEquipment(formData, ctx.prevEquipment),
    deity: ctx.deity ?? null,
    xp: readInt(formData, "xp", 0, XP_PER_LEVEL) ?? 0,
    heroPoints: readInt(formData, "heroPoints", 0, 3) ?? 0,
  };
}
