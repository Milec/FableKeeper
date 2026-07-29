/**
 * PF2E encounter budgeting.
 *
 * Implements the Pathfinder 2e encounter-building math: an XP budget per
 * threat level (scaled by party size) and per-creature XP by level difference,
 * plus elite/weak adjustments and simple/complex hazards. These are the game's
 * numeric guidelines (facts, not expression); everything here is pure and
 * unit-tested.
 */

export const THREATS = ["trivial", "low", "moderate", "severe", "extreme"] as const;
export type Threat = (typeof THREATS)[number];

export const THREAT_LABELS: Record<Threat, string> = {
  trivial: "Trivial",
  low: "Low",
  moderate: "Moderate",
  severe: "Severe",
  extreme: "Extreme",
};

/** XP budget for a party of four. */
const BASE_BUDGET: Record<Threat, number> = {
  trivial: 40,
  low: 60,
  moderate: 80,
  severe: 120,
  extreme: 160,
};

/** XP added/removed per character above/below a party of four. */
const PER_CHARACTER: Record<Threat, number> = {
  trivial: 10,
  low: 15,
  moderate: 20,
  severe: 30,
  extreme: 40,
};

/** Creature XP by (creature level − party level). */
const CREATURE_XP: Record<number, number> = {
  [-4]: 10,
  [-3]: 15,
  [-2]: 20,
  [-1]: 30,
  0: 40,
  1: 60,
  2: 80,
  3: 120,
  4: 160,
};

export type CombatantKind = "creature" | "simple_hazard" | "complex_hazard";
export type Adjustment = "none" | "elite" | "weak";

export interface Combatant {
  id: string;
  name: string;
  level: number;
  count: number;
  kind: CombatantKind;
  adjustment: Adjustment;
}

/** The XP budget for a party at a given threat. */
export function xpBudget(partySize: number, threat: Threat): number {
  const size = Math.max(1, partySize);
  return BASE_BUDGET[threat] + (size - 4) * PER_CHARACTER[threat];
}

/** XP for a single creature of `creatureLevel` against `partyLevel`. */
export function creatureXp(creatureLevel: number, partyLevel: number): number {
  const delta = creatureLevel - partyLevel;
  if (delta <= -5) return 0; // 5+ levels below is negligible.
  if (delta >= 4) return CREATURE_XP[4]!;
  return CREATURE_XP[delta] ?? 0;
}

/** Effective level of a combatant after an elite/weak adjustment. */
export function effectiveLevel(combatant: Combatant): number {
  const shift =
    combatant.adjustment === "elite"
      ? 1
      : combatant.adjustment === "weak"
        ? -1
        : 0;
  return combatant.level + shift;
}

/** Total XP contributed by one combatant stack (level, kind, count). */
export function combatantXp(combatant: Combatant, partyLevel: number): number {
  const lvl = effectiveLevel(combatant);
  const perCreature = creatureXp(lvl, partyLevel);
  // A simple hazard is worth roughly a fifth of a creature of its level; a
  // complex hazard counts as a full creature.
  const per =
    combatant.kind === "simple_hazard"
      ? Math.round(perCreature / 5)
      : perCreature;
  return per * Math.max(0, combatant.count);
}

export interface EncounterSummary {
  totalXp: number;
  budget: number;
  /** The threat the total XP actually lands on (may differ from the target). */
  rating: Threat;
  /** How far over/under budget, in XP. */
  overUnder: number;
}

/** Classify a total XP amount into the threat it represents for this party. */
export function ratingForXp(totalXp: number, partySize: number): Threat {
  // Walk from highest to lowest and take the first the total meets.
  for (let i = THREATS.length - 1; i >= 0; i--) {
    const threat = THREATS[i]!;
    if (totalXp >= xpBudget(partySize, threat)) return threat;
  }
  return "trivial";
}

/** Summarise an encounter against a target threat. */
export function summarize(
  combatants: Combatant[],
  partySize: number,
  partyLevel: number,
  targetThreat: Threat,
): EncounterSummary {
  const totalXp = combatants.reduce(
    (sum, c) => sum + combatantXp(c, partyLevel),
    0,
  );
  const budget = xpBudget(partySize, targetThreat);
  return {
    totalXp,
    budget,
    rating: ratingForXp(totalXp, partySize),
    overUnder: totalXp - budget,
  };
}
