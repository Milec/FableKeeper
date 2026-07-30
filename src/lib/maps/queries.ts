import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CampaignMap, MapPin } from "@/types/database";

export async function getMaps(campaignId: string): Promise<CampaignMap[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("maps")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getMap(mapId: string): Promise<CampaignMap | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("maps").select("*").eq("id", mapId).maybeSingle();
  return data ?? null;
}

export interface PinWithEntry extends MapPin {
  /** World id of the linked entry, so the viewer can build its href. */
  entry_world_id: string | null;
}

/**
 * Pins for a map, with the world id needed to link each one to its article.
 *
 * RLS already hides unrevealed pins from players, so this returns everything the
 * caller is entitled to see and the viewer doesn't re-filter.
 */
export async function getMapPins(mapId: string): Promise<PinWithEntry[]> {
  const supabase = await createClient();
  const { data: pins } = await supabase
    .from("map_pins")
    .select("*")
    .eq("map_id", mapId)
    .order("label");
  if (!pins?.length) return [];

  // Resolved with a second query rather than a PostgREST embed: an embed needs a
  // declared relationship, and one extra round trip is cheaper than the
  // indirection. RLS still filters both sides.
  const entryIds = [...new Set(pins.map((p) => p.entry_id).filter((id): id is string => !!id))];
  const worldByEntry = new Map<string, string>();
  if (entryIds.length) {
    const { data: entries } = await supabase
      .from("world_entries")
      .select("id, world_id")
      .in("id", entryIds);
    for (const entry of entries ?? []) worldByEntry.set(entry.id, entry.world_id);
  }

  return pins.map((pin) => ({
    ...pin,
    entry_world_id: pin.entry_id ? (worldByEntry.get(pin.entry_id) ?? null) : null,
  }));
}
