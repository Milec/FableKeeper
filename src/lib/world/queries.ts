import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  Campaign,
  CampaignRole,
  World,
  WorldEntry,
  WorldEntryType,
} from "@/types/database";

/** Read the markdown body out of an entry's `content` jsonb. */
export function entryMarkdown(entry: Pick<WorldEntry, "content">): string {
  const content = entry.content as { markdown?: unknown } | null;
  return typeof content?.markdown === "string" ? content.markdown : "";
}

export interface CampaignContext extends Campaign {
  role: CampaignRole;
}

/**
 * Fetch a campaign the current user belongs to, along with their role. Returns
 * null if the campaign doesn't exist or the user isn't a member (RLS enforces
 * the membership check server-side).
 */
export async function getCampaignContext(
  campaignId: string,
): Promise<CampaignContext | null> {
  const supabase = await createClient();
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("campaign_members")
    .select("role")
    .eq("campaign_id", campaignId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return null;

  return { ...campaign, role: membership.role };
}

export async function getWorlds(campaignId: string): Promise<World[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("worlds")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function getWorld(worldId: string): Promise<World | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("worlds")
    .select("*")
    .eq("id", worldId)
    .maybeSingle();
  return data;
}

export interface GetEntriesOptions {
  type?: WorldEntryType;
  limit?: number;
}

export async function getEntries(
  worldId: string,
  options: GetEntriesOptions = {},
): Promise<WorldEntry[]> {
  const supabase = await createClient();
  let query = supabase
    .from("world_entries")
    .select("*")
    .eq("world_id", worldId)
    .order("title", { ascending: true });
  if (options.type) query = query.eq("type", options.type);
  if (options.limit) query = query.limit(options.limit);
  const { data } = await query;
  return data ?? [];
}

export async function getEntry(entryId: string): Promise<WorldEntry | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("world_entries")
    .select("*")
    .eq("id", entryId)
    .maybeSingle();
  return data;
}

/** Lightweight title/slug/type list for a world — used to resolve wiki links. */
export interface EntryRef {
  id: string;
  title: string;
  slug: string;
  type: WorldEntryType;
  is_secret: boolean;
}

export async function getEntryRefs(worldId: string): Promise<EntryRef[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("world_entries")
    .select("id, title, slug, type, is_secret")
    .eq("world_id", worldId);
  return (data as EntryRef[] | null) ?? [];
}

/** Entries that link TO the given entry (Obsidian-style backlinks). */
export async function getBacklinks(entryId: string): Promise<WorldEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("entry_links")
    .select("source:world_entries!entry_links_source_entry_id_fkey(*)")
    .eq("target_entry_id", entryId);
  if (!data) return [];
  return data
    .map((row) => (row as unknown as { source: WorldEntry | null }).source)
    .filter((e): e is WorldEntry => Boolean(e));
}

/**
 * Search entries across a campaign by title/summary/tags. RLS scopes the results
 * to entries the current user is allowed to see (so players never get secrets).
 */
export async function searchEntries(
  campaignId: string,
  rawQuery: string,
  limit = 30,
): Promise<WorldEntry[]> {
  const term = rawQuery.trim();
  if (!term) return [];
  const supabase = await createClient();
  // Escape PostgREST `or` filter special characters.
  const safe = term.replace(/[%,()]/g, " ");
  const { data } = await supabase
    .from("world_entries")
    .select("*")
    .eq("campaign_id", campaignId)
    .or(`title.ilike.%${safe}%,summary.ilike.%${safe}%`)
    .order("updated_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}
