import type { Combatant } from "@/lib/encounters/budget";

/** Client-safe reader for an encounter's combatants jsonb value. */
export function encounterCombatantsClient(combatants: unknown): Combatant[] {
  return Array.isArray(combatants) ? (combatants as Combatant[]) : [];
}
