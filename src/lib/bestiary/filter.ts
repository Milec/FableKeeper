import type { Creature, CreatureFilters } from "./types";

/** Does a creature satisfy the given filters? Pure and case-insensitive. */
export function matchesFilters(
  creature: Creature,
  filters: CreatureFilters,
): boolean {
  const { search, types, rarities, sizes, sources, minLevel, maxLevel } = filters;

  if (typeof minLevel === "number" && creature.level < minLevel) return false;
  if (typeof maxLevel === "number" && creature.level > maxLevel) return false;

  if (search && search.trim()) {
    if (!creature.name.toLowerCase().includes(search.trim().toLowerCase())) {
      return false;
    }
  }
  if (types?.length && !creature.types.some((t) => types.includes(t))) return false;
  if (rarities?.length && !rarities.includes(creature.rarity)) return false;
  if (sizes?.length && !sizes.includes(creature.size)) return false;
  if (sources?.length && !sources.includes(creature.source)) return false;

  return true;
}

/** Filter a creature pool, capped to `limit` results (0 = unlimited). */
export function filterCreatures(
  pool: readonly Creature[],
  filters: CreatureFilters,
  limit = 0,
): Creature[] {
  const out: Creature[] = [];
  for (const c of pool) {
    if (!matchesFilters(c, filters)) continue;
    out.push(c);
    if (limit > 0 && out.length >= limit) break;
  }
  return out;
}

/** Distinct sorted values of a creature facet, for building filter controls. */
export function facetValues(
  pool: readonly Creature[],
  facet: "types" | "rarity" | "size" | "source",
): string[] {
  const set = new Set<string>();
  for (const c of pool) {
    if (facet === "types") c.types.forEach((t) => set.add(t));
    else set.add(c[facet]);
  }
  return [...set].sort();
}
