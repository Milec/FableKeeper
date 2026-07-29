import { createRng, type Rng } from "@/lib/generators/random";
import { filterCreatures } from "@/lib/bestiary/filter";
import type { Creature, CreatureFilters } from "@/lib/bestiary/types";
import { creatureXp, xpBudget, type Combatant, type Threat } from "./budget";

/**
 * Automatic PF2E encounter generation.
 *
 * Given a creature pool (the bestiary), a party, a target threat, and optional
 * criteria, fill an encounter that lands on the PF2E XP budget. Pure and
 * seedable so results are reproducible and unit-testable.
 */

export const COMPOSITIONS = [
  "any",
  "solo",
  "duo",
  "group",
  "horde",
  "boss-and-minions",
] as const;
export type Composition = (typeof COMPOSITIONS)[number];

export const COMPOSITION_LABELS: Record<Composition, string> = {
  any: "Any (surprise me)",
  solo: "Solo — one strong foe",
  duo: "Duo — a matched pair",
  group: "Group — 3–5 foes",
  horde: "Horde — many weak foes",
  "boss-and-minions": "Boss & minions",
};

export interface GenerateOptions {
  pool: readonly Creature[];
  partySize: number;
  partyLevel: number;
  threat: Threat;
  composition?: Composition;
  filters?: CreatureFilters;
  seed?: number | string;
}

export interface GenerateResult {
  combatants: Combatant[];
  /** Total XP of the generated encounter. */
  totalXp: number;
  /** The XP budget it was aiming for. */
  budget: number;
  /** Set when no creature matched the criteria. */
  error?: string;
}

/** Creature levels that are meaningful against a party (others award 0 XP). */
function levelWindow(partyLevel: number): [number, number] {
  return [partyLevel - 4, partyLevel + 4];
}

/** How many enemies a composition wants, and the boss share of the budget. */
function plan(rng: Rng, composition: Composition): { count: number; bossShare: number } {
  const style: Composition =
    composition === "any"
      ? rng.weighted([
          { value: "solo" as Composition, weight: 2 },
          { value: "duo" as Composition, weight: 3 },
          { value: "group" as Composition, weight: 4 },
          { value: "horde" as Composition, weight: 2 },
          { value: "boss-and-minions" as Composition, weight: 3 },
        ])
      : composition;

  switch (style) {
    case "solo":
      return { count: 1, bossShare: 1 };
    case "duo":
      return { count: 2, bossShare: 0 };
    case "group":
      return { count: rng.int(3, 5), bossShare: 0 };
    case "horde":
      return { count: rng.int(6, 9), bossShare: 0 };
    case "boss-and-minions":
      return { count: rng.int(4, 6), bossShare: 0.55 };
    default:
      return { count: rng.int(2, 4), bossShare: 0 };
  }
}

/**
 * Pick the creature whose XP best fits `targetXp`, from those available in the
 * pool. Prefers exact-ish matches but randomises among equally good levels so
 * repeated generations vary.
 */
function pickForBudget(
  rng: Rng,
  byLevel: Map<number, Creature[]>,
  partyLevel: number,
  targetXp: number,
  maxXp: number,
): Creature | null {
  const scored: { level: number; xp: number; delta: number }[] = [];
  for (const level of byLevel.keys()) {
    const xp = creatureXp(level, partyLevel);
    if (xp <= 0 || xp > maxXp) continue;
    scored.push({ level, xp, delta: Math.abs(xp - targetXp) });
  }
  if (scored.length === 0) return null;

  scored.sort((a, b) => a.delta - b.delta);
  // Consider all levels tied for best fit, plus the next-best, then pick one.
  const best = scored[0]!.delta;
  const pool = scored.filter((s) => s.delta <= best + 10);
  const chosen = rng.pick(pool);
  const creatures = byLevel.get(chosen.level)!;
  return rng.pick(creatures);
}

let seq = 0;
function nextId(): string {
  seq += 1;
  return `g${Date.now().toString(36)}${seq}`;
}

/**
 * Choose how many creatures of each XP value sum to (as close as possible to)
 * the budget, preferring a total count near `desiredCount`.
 *
 * PF2E creature XP comes in coarse steps (10/15/20/30/40/60/80/120/160), so
 * filling a budget greedily routinely finishes a few XP short — and because the
 * threat thresholds are hard steps, being short by 5 XP reports the encounter a
 * whole band lower than requested. This solves it exactly instead: a small
 * bounded DP over (sum, count), which is cheap at these sizes and lets us land
 * on the budget almost every time.
 *
 * Returns the chosen XP values, or null when nothing is reachable.
 */
export function solveBudget(
  denominations: number[],
  budget: number,
  desiredCount: number,
  rng: Rng,
): number[] | null {
  const denoms = [...new Set(denominations)].filter((d) => d > 0).sort((a, b) => a - b);
  if (denoms.length === 0 || budget <= 0) return null;

  // Search a little past the budget. At some party levels the budget simply
  // cannot be formed from the available XP steps (e.g. a level-1 party of three
  // needs 45 XP, but no creature below level -1 exists, so only multiples of
  // 20/30/40… are reachable). Landing just over is better than landing under,
  // because only sums >= the budget report the requested threat.
  const slack = Math.max(denoms[0]!, Math.round(budget * 0.25));
  const ceiling = budget + slack;

  const maxCount = Math.min(40, Math.max(1, Math.ceil(ceiling / denoms[0]!)));
  // reachable[sum][count]
  const reachable: boolean[][] = Array.from({ length: ceiling + 1 }, () =>
    new Array<boolean>(maxCount + 1).fill(false),
  );
  reachable[0]![0] = true;

  for (let sum = 0; sum <= ceiling; sum++) {
    for (let k = 0; k < maxCount; k++) {
      if (!reachable[sum]![k]) continue;
      for (const d of denoms) {
        if (sum + d <= ceiling) reachable[sum + d]![k + 1] = true;
      }
    }
  }

  const countsFor = (sum: number): number[] => {
    const counts: number[] = [];
    for (let k = 1; k <= maxCount; k++) if (reachable[sum]![k]) counts.push(k);
    counts.sort(
      (a, b) => Math.abs(a - desiredCount) - Math.abs(b - desiredCount) || a - b,
    );
    return counts;
  };

  // Prefer the smallest sum that meets the budget; otherwise the largest sum
  // below it. Then take the creature count closest to the composition's ask.
  let best: { sum: number; count: number } | null = null;
  for (let sum = budget; sum <= ceiling; sum++) {
    const counts = countsFor(sum);
    if (counts.length) {
      best = { sum, count: counts[0]! };
      break;
    }
  }
  if (!best) {
    for (let sum = budget - 1; sum >= 1; sum--) {
      const counts = countsFor(sum);
      if (counts.length) {
        best = { sum, count: counts[0]! };
        break;
      }
    }
  }
  if (!best) return null;

  // Walk the table back to recover one concrete combination, shuffling the
  // denomination order so repeated calls vary.
  const out: number[] = [];
  let { sum, count } = best;
  while (count > 0 && sum > 0) {
    const order = rng.sample(denoms, denoms.length);
    const next = order.find((d) => d <= sum && reachable[sum - d]![count - 1]);
    if (next === undefined) return out.length ? out : null;
    out.push(next);
    sum -= next;
    count -= 1;
  }
  return out;
}

/** Generate an encounter that fits the PF2E XP budget for the given party. */
export function generateEncounter(options: GenerateOptions): GenerateResult {
  const {
    pool,
    partySize,
    partyLevel,
    threat,
    composition = "any",
    filters = {},
    seed,
  } = options;

  const rng = createRng(seed);
  const budget = xpBudget(partySize, threat);
  const [minLevel, maxLevel] = levelWindow(partyLevel);

  // Respect the caller's level bounds but never leave the meaningful window.
  const candidates = filterCreatures(pool, {
    ...filters,
    minLevel: Math.max(minLevel, filters.minLevel ?? minLevel),
    maxLevel: Math.min(maxLevel, filters.maxLevel ?? maxLevel),
  });

  if (candidates.length === 0) {
    return {
      combatants: [],
      totalXp: 0,
      budget,
      error: "No creatures match those criteria. Try widening the filters.",
    };
  }

  const byLevel = new Map<number, Creature[]>();
  for (const c of candidates) {
    const list = byLevel.get(c.level);
    if (list) list.push(c);
    else byLevel.set(c.level, [c]);
  }

  const { count, bossShare } = plan(rng, composition);
  const picks: Creature[] = [];
  let remaining = budget;

  // Boss first, when the composition calls for one.
  if (bossShare > 0) {
    const boss = pickForBudget(rng, byLevel, partyLevel, budget * bossShare, remaining);
    if (boss) {
      picks.push(boss);
      remaining -= creatureXp(boss.level, partyLevel);
    }
  }

  // Fill the remaining budget exactly. Map each available creature level to the
  // XP it awards, solve for a combination of XP values, then draw a random
  // creature for each value.
  const levelsByXp = new Map<number, number[]>();
  for (const level of byLevel.keys()) {
    const xp = creatureXp(level, partyLevel);
    if (xp <= 0) continue;
    const list = levelsByXp.get(xp);
    if (list) list.push(level);
    else levelsByXp.set(xp, [level]);
  }

  const slots = Math.max(1, count - picks.length);
  const solution = solveBudget([...levelsByXp.keys()], remaining, slots, rng);

  if (solution) {
    for (const xp of solution) {
      const levels = levelsByXp.get(xp);
      if (!levels?.length) continue;
      const level = rng.pick(levels);
      picks.push(rng.pick(byLevel.get(level)!));
      remaining -= xp;
    }
  } else {
    // Fallback: greedy fill (only reached when the budget is below the cheapest
    // available creature).
    for (let i = 0; i < slots; i++) {
      const creature = pickForBudget(
        rng,
        byLevel,
        partyLevel,
        Math.max(10, remaining / Math.max(1, slots - i)),
        remaining,
      );
      if (!creature) break;
      picks.push(creature);
      remaining -= creatureXp(creature.level, partyLevel);
      if (remaining <= 0) break;
    }
  }

  if (picks.length === 0) {
    // Budget too small for anything in range — fall back to the cheapest.
    const cheapest = [...byLevel.keys()].sort(
      (a, b) => creatureXp(a, partyLevel) - creatureXp(b, partyLevel),
    )[0];
    if (cheapest !== undefined) picks.push(rng.pick(byLevel.get(cheapest)!));
  }

  // Group duplicates into a single combatant with a count.
  const grouped = new Map<string, Combatant>();
  for (const c of picks) {
    const key = `${c.name}|${c.level}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    grouped.set(key, {
      id: nextId(),
      name: c.name,
      level: c.level,
      count: 1,
      kind: "creature",
      adjustment: "none",
      source: c.source,
    });
  }

  const combatants = [...grouped.values()].sort((a, b) => b.level - a.level);
  const totalXp = combatants.reduce(
    (sum, c) => sum + creatureXp(c.level, partyLevel) * c.count,
    0,
  );

  return { combatants, totalXp, budget };
}
