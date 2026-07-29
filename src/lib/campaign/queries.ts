import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Quest, Session } from "@/types/database";

export { contentMarkdown } from "@/lib/campaign/content";

export async function getSessions(campaignId: string): Promise<Session[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sessions")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("session_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getSession(id: string): Promise<Session | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function getQuests(campaignId: string): Promise<Quest[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("quests")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getQuest(id: string): Promise<Quest | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("quests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data;
}
