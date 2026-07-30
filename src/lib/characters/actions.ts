"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parsePathbuilder, PathbuilderParseError } from "./pathbuilder";
import { XP_PER_LEVEL } from "./sheet";
import type { Json } from "@/types/database";

export interface CharacterActionState {
  error?: string;
}

// ---------------------------------------------------------------------------
// Manual create / edit
// ---------------------------------------------------------------------------

const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;

const characterSchema = z.object({
  campaignId: z.string().uuid(),
  name: z.string().min(1, "Name is required.").max(120),
  ancestry: z.string().max(120).optional(),
  heritage: z.string().max(120).optional(),
  background: z.string().max(120).optional(),
  characterClass: z.string().max(120).optional(),
  level: z.coerce.number().int().min(1).max(20),
  keyAbility: z.string().max(3).optional(),
  deity: z.string().max(120).optional(),
  portraitUrl: z.string().url().optional().or(z.literal("")),
});

/** The fields of `characters.data` this form owns, ready to merge. */
function readSheetData(
  formData: FormData,
  { deity, keyAbility }: { deity?: string; keyAbility: string | null },
) {
  const notes = formData.get("notes");
  const xp = readInt(formData, "xp", 0, XP_PER_LEVEL);
  const heroPoints = readInt(formData, "heroPoints", 0, 3);
  return {
    notes: typeof notes === "string" ? notes : "",
    // Mirrored from the column so Class DC derivation works the same way for
    // hand-built characters as it does for Pathbuilder imports.
    keyAbility,
    coins: readCoins(formData),
    languages: readList(formData, "languages"),
    conditions: readList(formData, "conditions"),
    proficiencies: readProficiencies(formData),
    lores: readLores(formData),
    feats: readFeats(formData),
    equipment: readEquipment(formData),
    deity: deity ?? null,
    xp: xp ?? 0,
    heroPoints: heroPoints ?? 0,
  };
}

function readAbilities(formData: FormData) {
  const abilities: Record<string, number> = {};
  for (const key of ABILITY_KEYS) {
    const raw = formData.get(`ability_${key}`);
    const n = typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
    if (Number.isFinite(n)) abilities[key] = n;
  }
  return abilities;
}

/** Coin purse from the wealth fields; zeroes are dropped. */
function readCoins(formData: FormData) {
  const coins: Record<string, number> = {};
  for (const key of ["pp", "gp", "sp", "cp"] as const) {
    const raw = formData.get(`coin_${key}`);
    const n = typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
    if (Number.isFinite(n) && n > 0) coins[key] = n;
  }
  return coins;
}

/** Parse a hidden JSON field, returning `fallback` on anything unexpected. */
function readJson<T>(formData: FormData, field: string, fallback: T): T {
  const raw = formData.get(field);
  if (typeof raw !== "string" || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const VALID_RANKS = new Set([0, 2, 4, 6, 8]);

/** Proficiency ranks from the rank editor, clamped to valid PF2E ranks. */
function readProficiencies(formData: FormData): Record<string, number> {
  const raw = readJson<Record<string, unknown>>(formData, "proficiencies", {});
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "number" && VALID_RANKS.has(value)) out[key] = value;
  }
  return out;
}

/** Lore skills as Pathbuilder-compatible [name, rank] tuples. */
function readLores(formData: FormData): [string, number][] {
  const raw = readJson<unknown[]>(formData, "lores", []);
  const out: [string, number][] = [];
  for (const entry of raw) {
    if (!Array.isArray(entry)) continue;
    const name = typeof entry[0] === "string" ? entry[0].trim() : "";
    const rank = typeof entry[1] === "number" && VALID_RANKS.has(entry[1]) ? entry[1] : 0;
    if (name) out.push([name.slice(0, 60), rank]);
  }
  return out.slice(0, 30);
}

/** Feats as a flat list of names. */
function readFeats(formData: FormData): string[] {
  const raw = readJson<unknown[]>(formData, "feats", []);
  return raw
    .filter((f): f is string => typeof f === "string" && f.trim().length > 0)
    .map((f) => f.trim().slice(0, 120))
    .slice(0, 200);
}

/** Equipment as Pathbuilder-compatible [name, quantity] tuples. */
function readEquipment(formData: FormData): [string, number][] {
  const raw = readJson<unknown[]>(formData, "equipment", []);
  const out: [string, number][] = [];
  for (const entry of raw) {
    if (!Array.isArray(entry)) continue;
    const name = typeof entry[0] === "string" ? entry[0].trim() : "";
    const qty = typeof entry[1] === "number" && entry[1] > 0 ? Math.floor(entry[1]) : 1;
    if (name) out.push([name.slice(0, 120), Math.min(qty, 9999)]);
  }
  return out.slice(0, 300);
}

/** A bounded integer field, or undefined when blank. */
function readInt(
  formData: FormData,
  field: string,
  min: number,
  max: number,
): number | undefined {
  const raw = formData.get(field);
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(min, Math.min(max, n));
}

/** Split a comma-separated field into a trimmed, de-duplicated list. */
function readList(formData: FormData, field: string): string[] {
  const raw = formData.get(field);
  if (typeof raw !== "string") return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ].slice(0, 40);
}

function readDefenses(formData: FormData) {
  const defenses: Record<string, number> = {};
  for (const key of ["ac", "hp_max", "hp_current", "speed"] as const) {
    const raw = formData.get(`def_${key}`);
    const n = typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
    if (Number.isFinite(n)) defenses[key] = n;
  }
  return defenses;
}

export async function createCharacter(
  _prev: CharacterActionState,
  formData: FormData,
): Promise<CharacterActionState> {
  const parsed = characterSchema.safeParse({
    campaignId: formData.get("campaignId"),
    name: formData.get("name"),
    ancestry: formData.get("ancestry") || undefined,
    heritage: formData.get("heritage") || undefined,
    background: formData.get("background") || undefined,
    characterClass: formData.get("characterClass") || undefined,
    level: formData.get("level") ?? 1,
    keyAbility: formData.get("keyAbility") || undefined,
    deity: formData.get("deity") || undefined,
    portraitUrl: formData.get("portraitUrl") || "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const keyAbility = parsed.data.keyAbility?.toLowerCase() ?? null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data, error } = await supabase
    .from("characters")
    .insert({
      campaign_id: parsed.data.campaignId,
      owner_id: user.id,
      name: parsed.data.name,
      ancestry: parsed.data.ancestry ?? null,
      heritage: parsed.data.heritage ?? null,
      background: parsed.data.background ?? null,
      class: parsed.data.characterClass ?? null,
      level: parsed.data.level,
      key_ability: keyAbility,
      portrait_url: parsed.data.portraitUrl || null,
      abilities: readAbilities(formData),
      defenses: readDefenses(formData),
      data: readSheetData(formData, {
        deity: parsed.data.deity,
        keyAbility,
      }) as unknown as Json,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/campaigns/${parsed.data.campaignId}/characters`);
  redirect(`/campaigns/${parsed.data.campaignId}/characters/${data.id}`);
}

export async function updateCharacter(
  _prev: CharacterActionState,
  formData: FormData,
): Promise<CharacterActionState> {
  const characterId = formData.get("characterId");
  if (typeof characterId !== "string") return { error: "Missing character id." };

  const parsed = characterSchema.safeParse({
    campaignId: formData.get("campaignId"),
    name: formData.get("name"),
    ancestry: formData.get("ancestry") || undefined,
    heritage: formData.get("heritage") || undefined,
    background: formData.get("background") || undefined,
    characterClass: formData.get("characterClass") || undefined,
    level: formData.get("level") ?? 1,
    keyAbility: formData.get("keyAbility") || undefined,
    deity: formData.get("deity") || undefined,
    portraitUrl: formData.get("portraitUrl") || "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const keyAbility = parsed.data.keyAbility?.toLowerCase() ?? null;

  const supabase = await createClient();
  // Preserve everything else in `data` (imported spells, alignment, ancestry
  // feats) and overwrite only the fields this form owns.
  const { data: existing } = await supabase
    .from("characters")
    .select("data")
    .eq("id", characterId)
    .maybeSingle();
  const prevData =
    existing?.data && typeof existing.data === "object"
      ? (existing.data as Record<string, unknown>)
      : {};

  const { error } = await supabase
    .from("characters")
    .update({
      name: parsed.data.name,
      ancestry: parsed.data.ancestry ?? null,
      heritage: parsed.data.heritage ?? null,
      background: parsed.data.background ?? null,
      class: parsed.data.characterClass ?? null,
      level: parsed.data.level,
      key_ability: keyAbility,
      portrait_url: parsed.data.portraitUrl || null,
      abilities: readAbilities(formData),
      defenses: readDefenses(formData),
      data: {
        ...prevData,
        ...readSheetData(formData, {
          deity: parsed.data.deity,
          keyAbility,
        }),
      } as unknown as Json,
    })
    .eq("id", characterId);

  if (error) return { error: error.message };

  const base = `/campaigns/${parsed.data.campaignId}/characters/${characterId}`;
  revalidatePath(base);
  redirect(base);
}

export async function deleteCharacter(formData: FormData): Promise<void> {
  const characterId = formData.get("characterId");
  const campaignId = formData.get("campaignId");
  if (typeof characterId !== "string" || typeof campaignId !== "string") return;

  const supabase = await createClient();
  await supabase.from("characters").delete().eq("id", characterId);

  revalidatePath(`/campaigns/${campaignId}/characters`);
  redirect(`/campaigns/${campaignId}/characters`);
}

// ---------------------------------------------------------------------------
// Pathbuilder import
// ---------------------------------------------------------------------------

export async function importPathbuilderCharacter(
  _prev: CharacterActionState,
  formData: FormData,
): Promise<CharacterActionState> {
  const campaignId = formData.get("campaignId");
  const json = formData.get("json");
  if (typeof campaignId !== "string") return { error: "Missing campaign." };
  if (typeof json !== "string" || !json.trim()) {
    return { error: "Paste your Pathbuilder JSON export." };
  }

  let parsed;
  try {
    parsed = parsePathbuilder(json);
  } catch (err) {
    return {
      error:
        err instanceof PathbuilderParseError
          ? err.message
          : "Could not read that Pathbuilder export.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data, error } = await supabase
    .from("characters")
    .insert({
      campaign_id: campaignId,
      owner_id: user.id,
      name: parsed.name,
      ancestry: parsed.ancestry ?? null,
      heritage: parsed.heritage ?? null,
      background: parsed.background ?? null,
      class: parsed.class ?? null,
      level: parsed.level,
      key_ability: parsed.keyAbility ?? null,
      abilities: parsed.abilities as unknown as Json,
      defenses: parsed.defenses as unknown as Json,
      data: parsed.data as unknown as Json,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/campaigns/${campaignId}/characters`);
  redirect(`/campaigns/${campaignId}/characters/${data.id}`);
}
