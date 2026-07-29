import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Encounter } from "@/types/database";
import type { Combatant } from "./budget";

/** Read the combatant list off an encounter row. */
export function encounterCombatants(encounter: Pick<Encounter, "combatants">): Combatant[] {
  return Array.isArray(encounter.combatants)
    ? (encounter.combatants as unknown as Combatant[])
    : [];
}

export async function getEncounters(campaignId: string): Promise<Encounter[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("encounters")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("updated_at", { ascending: false });
  return data ?? [];
}

export async function getEncounter(id: string): Promise<Encounter | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("encounters")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data;
}
