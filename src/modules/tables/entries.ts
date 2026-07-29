import type { TableEntry } from "@/lib/tables/roll";

/** Client-safe reader for a roll table's entries jsonb value. */
export function tableEntriesClient(entries: unknown): TableEntry[] {
  return Array.isArray(entries) ? (entries as TableEntry[]) : [];
}
