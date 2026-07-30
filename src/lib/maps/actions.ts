"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { extractWikiLinks } from "@/lib/world/wikilinks";
import { AzgaarParseError, parseAzgaarMap, type AzgaarMap } from "./azgaar";
import { buildPinDrafts } from "./pins";
import {
  buildEntryDrafts,
  IMPORT_GROUPS,
  type EntryDraft,
  type ImportGroup,
} from "./entries";
import type { Json } from "@/types/database";

export interface ImportActionState {
  error?: string;
  /** Set on success so the form can report what happened. */
  result?: ImportResult;
}

export interface ImportResult {
  created: number;
  /** Entries whose slug already existed in the world, so they were left alone. */
  skipped: number;
  links: number;
  byType: Record<string, number>;
  mapName: string | null;
  /** The interactive map created for this import, when pins were placed. */
  mapId: string | null;
  pins: number;
}

const schema = z.object({
  campaignId: z.string().uuid(),
  worldId: z.string().uuid(),
  groups: z.array(z.enum(IMPORT_GROUPS)).min(1, "Choose at least one thing to import."),
  minBurgPopulation: z.coerce.number().int().min(0).max(10_000_000),
  secret: z.boolean(),
  /** Also create an interactive map with a pin per settlement and site. */
  createMap: z.boolean(),
});

/**
 * Postgres has a parameter limit per statement, and a large Azgaar map can carry
 * several hundred burgs, so inserts are chunked rather than sent as one array.
 */
const INSERT_CHUNK = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function importAzgaarMap(
  _prev: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const parsed = schema.safeParse({
    campaignId: formData.get("campaignId"),
    worldId: formData.get("worldId"),
    groups: formData.getAll("groups").filter((g): g is string => typeof g === "string"),
    minBurgPopulation: formData.get("minBurgPopulation") || 0,
    secret: formData.get("secret") === "on",
    createMap: formData.get("createMap") !== "off",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const json = formData.get("json");
  if (typeof json !== "string" || !json.trim()) {
    return { error: "Paste or upload your Azgaar JSON export first." };
  }

  let drafts: EntryDraft[];
  let azgaar: AzgaarMap;
  try {
    azgaar = parseAzgaarMap(json);
    drafts = buildEntryDrafts(azgaar, {
      groups: parsed.data.groups as ImportGroup[],
      minBurgPopulation: parsed.data.minBurgPopulation,
    });
  } catch (err) {
    return {
      error:
        err instanceof AzgaarParseError
          ? err.message
          : "Could not read that file as an Azgaar export.",
    };
  }

  if (!drafts.length) {
    return { error: "That map produced nothing to import with the current filters." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  // RLS decides whether this user may write to the world; confirming it exists
  // first turns a policy rejection into a clear message.
  const { data: world } = await supabase
    .from("worlds")
    .select("id, campaign_id")
    .eq("id", parsed.data.worldId)
    .maybeSingle();
  if (!world || world.campaign_id !== parsed.data.campaignId) {
    return { error: "That world is not part of this campaign." };
  }

  // Re-importing the same map should not duplicate everything, so entries whose
  // slug already exists are left untouched rather than overwritten — the GM has
  // probably edited them by then.
  const { data: existing } = await supabase
    .from("world_entries")
    .select("slug")
    .eq("world_id", parsed.data.worldId);
  const taken = new Set((existing ?? []).map((e) => e.slug));

  const fresh = drafts.filter((d) => !taken.has(d.slug));
  const skipped = drafts.length - fresh.length;
  if (!fresh.length) {
    return {
      error: `Every one of those ${drafts.length} entries already exists in this world.`,
    };
  }

  const rows = fresh.map((draft) => ({
    world_id: parsed.data.worldId,
    campaign_id: parsed.data.campaignId,
    type: draft.type,
    title: draft.title,
    slug: draft.slug,
    summary: draft.summary,
    content: { markdown: draft.markdown },
    is_secret: parsed.data.secret,
    tags: draft.tags,
    created_by: user.id,
  }));

  const inserted: { id: string; slug: string }[] = [];
  for (const batch of chunk(rows, INSERT_CHUNK)) {
    const { data, error } = await supabase
      .from("world_entries")
      .insert(batch)
      .select("id, slug");
    if (error) {
      // Partial success is still worth reporting: the GM can re-run the import
      // and the already-created entries will be skipped.
      return {
        error: `Imported ${inserted.length} entries, then failed: ${error.message}`,
      };
    }
    inserted.push(...(data ?? []));
  }

  const links = await linkImportedEntries(supabase, parsed.data.worldId, fresh, inserted);

  const map = parsed.data.createMap
    ? await createMapWithPins(supabase, {
        campaignId: parsed.data.campaignId,
        worldId: parsed.data.worldId,
        userId: user.id,
        azgaar,
        drafts,
        minBurgPopulation: parsed.data.minBurgPopulation,
        revealed: !parsed.data.secret,
      })
    : { mapId: null, pins: 0 };

  const byType: Record<string, number> = {};
  for (const draft of fresh) byType[draft.type] = (byType[draft.type] ?? 0) + 1;

  revalidatePath(`/campaigns/${parsed.data.campaignId}/worlds/${parsed.data.worldId}`);
  revalidatePath(`/campaigns/${parsed.data.campaignId}/maps`);

  return {
    result: {
      created: inserted.length,
      skipped,
      links,
      byType,
      mapName: azgaar.info.mapName,
      mapId: map.mapId,
      pins: map.pins,
    },
  };
}

/**
 * Create the interactive map and its pins.
 *
 * Pins resolve to articles by slug against the whole world, so a pin still finds
 * its article when the entry already existed from an earlier import.
 *
 * A failure here doesn't fail the import: the articles are the substance, and
 * the map can be re-created by importing again.
 */
async function createMapWithPins(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opts: {
    campaignId: string;
    worldId: string;
    userId: string;
    azgaar: AzgaarMap;
    drafts: EntryDraft[];
    minBurgPopulation: number;
    revealed: boolean;
  },
): Promise<{ mapId: string | null; pins: number }> {
  const pinDrafts = buildPinDrafts(opts.azgaar, opts.drafts, {
    minBurgPopulation: opts.minBurgPopulation,
  });
  if (!pinDrafts.length) return { mapId: null, pins: 0 };

  const { data: map, error } = await supabase
    .from("maps")
    .insert({
      campaign_id: opts.campaignId,
      world_id: opts.worldId,
      name: opts.azgaar.info.mapName ?? "Imported map",
      source: {
        source: "azgaar",
        version: opts.azgaar.info.version,
        seed: opts.azgaar.info.seed,
        width: opts.azgaar.info.width,
        height: opts.azgaar.info.height,
      } as unknown as Json,
      created_by: opts.userId,
    })
    .select("id")
    .single();
  if (error || !map) return { mapId: null, pins: 0 };

  const { data: entries } = await supabase
    .from("world_entries")
    .select("id, slug")
    .eq("world_id", opts.worldId);
  const idBySlug = new Map((entries ?? []).map((e) => [e.slug, e.id]));

  const rows = pinDrafts.map((pin) => ({
    map_id: map.id,
    campaign_id: opts.campaignId,
    entry_id: pin.entrySlug ? (idBySlug.get(pin.entrySlug) ?? null) : null,
    label: pin.label,
    kind: pin.kind,
    x: pin.x,
    y: pin.y,
    is_revealed: opts.revealed,
  }));

  let written = 0;
  for (const batch of chunk(rows, INSERT_CHUNK)) {
    const { error: pinError } = await supabase.from("map_pins").insert(batch);
    if (!pinError) written += batch.length;
  }
  return { mapId: map.id, pins: written };
}

/**
 * Build the backlink rows for a freshly imported batch.
 *
 * The per-entry save path resolves links with a query each; for an import of
 * several hundred entries that would be several hundred round trips. Every slug
 * involved is already known here, so the whole graph is resolved in memory from
 * one lookup of the world's entries.
 */
async function linkImportedEntries(
  supabase: Awaited<ReturnType<typeof createClient>>,
  worldId: string,
  drafts: EntryDraft[],
  inserted: { id: string; slug: string }[],
): Promise<number> {
  // Imported entries can link to entries that already existed, so the map has to
  // cover the whole world, not just this batch.
  const { data: all } = await supabase
    .from("world_entries")
    .select("id, slug")
    .eq("world_id", worldId);
  const idBySlug = new Map((all ?? []).map((e) => [e.slug, e.id]));
  const idOfDraft = new Map(inserted.map((e) => [e.slug, e.id]));

  const rows: { source_entry_id: string; target_entry_id: string }[] = [];
  const seen = new Set<string>();
  for (const draft of drafts) {
    const sourceId = idOfDraft.get(draft.slug);
    if (!sourceId) continue;
    for (const link of extractWikiLinks(draft.markdown)) {
      const targetId = idBySlug.get(link.slug);
      if (!targetId || targetId === sourceId) continue;
      const key = `${sourceId}:${targetId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ source_entry_id: sourceId, target_entry_id: targetId });
    }
  }

  let written = 0;
  for (const batch of chunk(rows, INSERT_CHUNK)) {
    const { error } = await supabase.from("entry_links").insert(batch);
    // Backlinks are derived data — a failure here shouldn't lose the import, and
    // re-saving any entry rebuilds its links.
    if (!error) written += batch.length;
  }
  return written;
}
