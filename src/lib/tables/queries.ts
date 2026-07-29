import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { RollTable } from "@/types/database";
import type { TableEntry } from "./roll";

/** Read the entries array off a roll table row. */
export function tableEntries(table: Pick<RollTable, "entries">): TableEntry[] {
  return Array.isArray(table.entries)
    ? (table.entries as unknown as TableEntry[])
    : [];
}

export async function getRollTables(campaignId: string): Promise<RollTable[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("roll_tables")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("name", { ascending: true });
  return data ?? [];
}

export async function getRollTable(id: string): Promise<RollTable | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("roll_tables")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data;
}
