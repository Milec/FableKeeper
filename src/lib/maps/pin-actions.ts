"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Reveal or hide a single pin.
 *
 * Authorisation is RLS's job: only a campaign editor can update `map_pins`, so a
 * player calling this changes nothing. The action reports failure so the viewer
 * can roll back its optimistic toggle rather than showing a lie.
 */
export async function setPinRevealed(pinId: string, revealed: boolean): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("map_pins")
    .update({ is_revealed: revealed })
    .eq("id", pinId)
    .select("campaign_id, map_id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("That pin could not be updated.");

  revalidatePath(`/campaigns/${data.campaign_id}/maps/${data.map_id}`);
}

/** Reveal or hide every pin on a map at once — the "lift the fog" button. */
export async function setAllPinsRevealed(
  mapId: string,
  revealed: boolean,
): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("map_pins")
    .update({ is_revealed: revealed })
    .eq("map_id", mapId)
    .select("campaign_id")
    .limit(1);

  if (error) throw new Error(error.message);
  const campaignId = data?.[0]?.campaign_id;
  if (campaignId) revalidatePath(`/campaigns/${campaignId}/maps/${mapId}`);
}
