import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * At-a-glance counts for the campaign overview.
 *
 * Every count runs through RLS as the signed-in user, so a Player's totals
 * exclude GM secrets rather than hinting at how much is hidden from them.
 * `head: true` fetches counts without rows.
 */
export interface CampaignStats {
  entries: number;
  characters: number;
  sessions: number;
  openQuests: number;
  encounters: number;
  tables: number;
  maps: number;
}

export async function getCampaignStats(campaignId: string): Promise<CampaignStats> {
  const supabase = await createClient();
  const count = async (
    table: "world_entries" | "characters" | "sessions" | "encounters" | "roll_tables" | "maps",
  ) => {
    const { count: n } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId);
    return n ?? 0;
  };

  const [entries, characters, sessions, encounters, tables, maps] = await Promise.all([
    count("world_entries"),
    count("characters"),
    count("sessions"),
    count("encounters"),
    count("roll_tables"),
    count("maps"),
  ]);

  const { count: openQuests } = await supabase
    .from("quests")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "active");

  return {
    entries,
    characters,
    sessions,
    openQuests: openQuests ?? 0,
    encounters,
    tables,
    maps,
  };
}
