"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import { ALL_ENTRY_TYPES } from "@/lib/world/entry-types";
import { extractWikiLinks } from "@/lib/world/wikilinks";
import type { WorldEntryType } from "@/types/database";

// ---------------------------------------------------------------------------
// Worlds
// ---------------------------------------------------------------------------

const worldSchema = z.object({
  campaignId: z.string().uuid(),
  name: z.string().min(1, "Name is required.").max(120),
  description: z.string().max(2000).optional(),
});

export interface WorldActionState {
  error?: string;
}

export async function createWorld(
  _prev: WorldActionState,
  formData: FormData,
): Promise<WorldActionState> {
  const parsed = worldSchema.safeParse({
    campaignId: formData.get("campaignId"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const slug = slugify(parsed.data.name) || "world";
  const { data, error } = await supabase
    .from("worlds")
    .insert({
      campaign_id: parsed.data.campaignId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      slug: `${slug}-${Math.random().toString(36).slice(2, 6)}`,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/campaigns/${parsed.data.campaignId}`);
  redirect(`/campaigns/${parsed.data.campaignId}/worlds/${data.id}`);
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

const entrySchema = z.object({
  worldId: z.string().uuid(),
  campaignId: z.string().uuid(),
  type: z.enum(ALL_ENTRY_TYPES as [WorldEntryType, ...WorldEntryType[]]),
  title: z.string().min(1, "Title is required.").max(200),
  summary: z.string().max(500).optional(),
  markdown: z.string().max(100_000).optional(),
  isSecret: z.boolean().optional(),
  tags: z.array(z.string().min(1).max(40)).max(50).optional(),
});

export interface EntryActionState {
  error?: string;
}

function parseTags(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string") return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, 50);
}

/**
 * Sync the `entry_links` table for a source entry from the wiki links found in
 * its markdown. Resolves `[[Title]]` targets to entries in the same world by
 * slug, then inserts any new links and removes stale ones.
 */
async function syncEntryLinks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sourceEntryId: string,
  worldId: string,
  markdown: string,
): Promise<void> {
  const links = extractWikiLinks(markdown);
  const slugs = links.map((l) => l.slug);

  // Resolve targets within the same world (excluding self-links).
  const resolvedIds = new Set<string>();
  if (slugs.length > 0) {
    const { data: targets } = await supabase
      .from("world_entries")
      .select("id, slug")
      .eq("world_id", worldId)
      .in("slug", slugs);
    for (const t of targets ?? []) {
      if (t.id !== sourceEntryId) resolvedIds.add(t.id);
    }
  }

  const { data: existing } = await supabase
    .from("entry_links")
    .select("id, target_entry_id")
    .eq("source_entry_id", sourceEntryId);
  const existingIds = new Set((existing ?? []).map((e) => e.target_entry_id));

  const toInsert = [...resolvedIds]
    .filter((id) => !existingIds.has(id))
    .map((id) => ({ source_entry_id: sourceEntryId, target_entry_id: id }));
  const toDelete = (existing ?? []).filter(
    (e) => !resolvedIds.has(e.target_entry_id),
  );

  if (toInsert.length > 0) {
    await supabase.from("entry_links").insert(toInsert);
  }
  if (toDelete.length > 0) {
    await supabase
      .from("entry_links")
      .delete()
      .in(
        "id",
        toDelete.map((e) => e.id),
      );
  }
}

export async function createEntry(
  _prev: EntryActionState,
  formData: FormData,
): Promise<EntryActionState> {
  const parsed = entrySchema.safeParse({
    worldId: formData.get("worldId"),
    campaignId: formData.get("campaignId"),
    type: formData.get("type"),
    title: formData.get("title"),
    summary: formData.get("summary") || undefined,
    markdown: formData.get("markdown") || undefined,
    isSecret: formData.get("isSecret") === "on",
    tags: parseTags(formData.get("tags")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const slug = slugify(parsed.data.title);
  if (!slug) return { error: "Title must contain letters or numbers." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const markdown = parsed.data.markdown ?? "";
  const { data: entry, error } = await supabase
    .from("world_entries")
    .insert({
      world_id: parsed.data.worldId,
      campaign_id: parsed.data.campaignId,
      type: parsed.data.type,
      title: parsed.data.title,
      slug,
      summary: parsed.data.summary ?? null,
      content: { markdown },
      is_secret: parsed.data.isSecret ?? false,
      tags: parsed.data.tags ?? [],
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "An entry with this name already exists in this world." };
    }
    return { error: error.message };
  }

  await syncEntryLinks(supabase, entry.id, parsed.data.worldId, markdown);

  revalidatePath(`/campaigns/${parsed.data.campaignId}/worlds/${parsed.data.worldId}`);
  redirect(
    `/campaigns/${parsed.data.campaignId}/worlds/${parsed.data.worldId}/entries/${entry.id}`,
  );
}

export async function updateEntry(
  _prev: EntryActionState,
  formData: FormData,
): Promise<EntryActionState> {
  const entryId = formData.get("entryId");
  if (typeof entryId !== "string") return { error: "Missing entry id." };

  const parsed = entrySchema.safeParse({
    worldId: formData.get("worldId"),
    campaignId: formData.get("campaignId"),
    type: formData.get("type"),
    title: formData.get("title"),
    summary: formData.get("summary") || undefined,
    markdown: formData.get("markdown") || undefined,
    isSecret: formData.get("isSecret") === "on",
    tags: parseTags(formData.get("tags")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const markdown = parsed.data.markdown ?? "";
  const { error } = await supabase
    .from("world_entries")
    .update({
      type: parsed.data.type,
      title: parsed.data.title,
      summary: parsed.data.summary ?? null,
      content: { markdown },
      is_secret: parsed.data.isSecret ?? false,
      tags: parsed.data.tags ?? [],
    })
    .eq("id", entryId);

  if (error) return { error: error.message };

  await syncEntryLinks(supabase, entryId, parsed.data.worldId, markdown);

  const base = `/campaigns/${parsed.data.campaignId}/worlds/${parsed.data.worldId}/entries/${entryId}`;
  revalidatePath(base);
  redirect(base);
}

export async function deleteEntry(formData: FormData): Promise<void> {
  const entryId = formData.get("entryId");
  const campaignId = formData.get("campaignId");
  const worldId = formData.get("worldId");
  if (
    typeof entryId !== "string" ||
    typeof campaignId !== "string" ||
    typeof worldId !== "string"
  ) {
    return;
  }

  const supabase = await createClient();
  await supabase.from("world_entries").delete().eq("id", entryId);

  revalidatePath(`/campaigns/${campaignId}/worlds/${worldId}`);
  redirect(`/campaigns/${campaignId}/worlds/${worldId}`);
}
