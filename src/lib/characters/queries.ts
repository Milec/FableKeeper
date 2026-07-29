import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Character } from "@/types/database";

/** Characters visible to the current user in a campaign (RLS-scoped). */
export async function getCharacters(campaignId: string): Promise<Character[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("characters")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("name", { ascending: true });
  return data ?? [];
}

export async function getCharacter(id: string): Promise<Character | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("characters")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data;
}

/** Whether the current user owns the given character. */
export async function isCharacterOwner(character: Character): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return Boolean(user && user.id === character.owner_id);
}
