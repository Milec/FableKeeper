"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseTableImport, TableImportError } from "./roll";
import type { Json } from "@/types/database";

export interface TableActionState {
  error?: string;
}

const entrySchema = z.object({
  weight: z.coerce.number().int().min(1).max(1000),
  text: z.string().min(1).max(1000),
});

const tableSchema = z.object({
  campaignId: z.string().uuid(),
  name: z.string().min(1, "Name is required.").max(200),
  description: z.string().max(2000).optional(),
  folder: z.string().max(120).optional(),
  tags: z.array(z.string().min(1).max(40)).max(50),
  entries: z.array(entrySchema).min(1, "Add at least one entry.").max(1000),
});

function parseTags(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string") return [];
  return [
    ...new Set(raw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)),
  ].slice(0, 50);
}

function parse(formData: FormData) {
  let entries: unknown = [];
  try {
    entries = JSON.parse((formData.get("entries") as string) || "[]");
  } catch {
    entries = [];
  }
  return tableSchema.safeParse({
    campaignId: formData.get("campaignId"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    folder: formData.get("folder") || undefined,
    tags: parseTags(formData.get("tags")),
    entries,
  });
}

export async function createRollTable(
  _prev: TableActionState,
  formData: FormData,
): Promise<TableActionState> {
  const parsed = parse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data, error } = await supabase
    .from("roll_tables")
    .insert({
      campaign_id: d.campaignId,
      name: d.name,
      description: d.description ?? null,
      folder: d.folder ?? null,
      tags: d.tags,
      entries: d.entries as unknown as Json,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath(`/campaigns/${d.campaignId}/tables`);
  redirect(`/campaigns/${d.campaignId}/tables/${data.id}`);
}

export async function updateRollTable(
  _prev: TableActionState,
  formData: FormData,
): Promise<TableActionState> {
  const tableId = formData.get("tableId");
  if (typeof tableId !== "string") return { error: "Missing table id." };
  const parsed = parse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("roll_tables")
    .update({
      name: d.name,
      description: d.description ?? null,
      folder: d.folder ?? null,
      tags: d.tags,
      entries: d.entries as unknown as Json,
    })
    .eq("id", tableId);

  if (error) return { error: error.message };
  const base = `/campaigns/${d.campaignId}/tables/${tableId}`;
  revalidatePath(base);
  redirect(base);
}

export async function deleteRollTable(formData: FormData): Promise<void> {
  const tableId = formData.get("tableId");
  const campaignId = formData.get("campaignId");
  if (typeof tableId !== "string" || typeof campaignId !== "string") return;
  const supabase = await createClient();
  await supabase.from("roll_tables").delete().eq("id", tableId);
  revalidatePath(`/campaigns/${campaignId}/tables`);
  redirect(`/campaigns/${campaignId}/tables`);
}

/** Create a new table from an imported JSON payload. */
export async function importRollTable(
  _prev: TableActionState,
  formData: FormData,
): Promise<TableActionState> {
  const campaignId = formData.get("campaignId");
  const json = formData.get("json");
  if (typeof campaignId !== "string") return { error: "Missing campaign." };
  if (typeof json !== "string" || !json.trim()) {
    return { error: "Paste a table JSON export." };
  }

  let imported;
  try {
    imported = parseTableImport(json);
  } catch (err) {
    return {
      error: err instanceof TableImportError ? err.message : "Invalid table JSON.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data, error } = await supabase
    .from("roll_tables")
    .insert({
      campaign_id: campaignId,
      name: imported.name,
      description: imported.description,
      tags: [],
      entries: imported.entries as unknown as Json,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath(`/campaigns/${campaignId}/tables`);
  redirect(`/campaigns/${campaignId}/tables/${data.id}`);
}
