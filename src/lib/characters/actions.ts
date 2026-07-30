"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parsePathbuilder, PathbuilderParseError } from "./pathbuilder";
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
  portraitUrl: z.string().url().optional().or(z.literal("")),
});

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
    portraitUrl: formData.get("portraitUrl") || "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const notes = formData.get("notes");
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
      portrait_url: parsed.data.portraitUrl || null,
      abilities: readAbilities(formData),
      defenses: readDefenses(formData),
      data: {
        notes: typeof notes === "string" ? notes : "",
        coins: readCoins(formData),
        languages: readList(formData, "languages"),
        conditions: readList(formData, "conditions"),
      },
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
    portraitUrl: formData.get("portraitUrl") || "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  // Preserve everything else in `data` (imported feats, spells, proficiencies)
  // and update only the fields this form owns.
  const { data: existing } = await supabase
    .from("characters")
    .select("data")
    .eq("id", characterId)
    .maybeSingle();
  const prevData =
    existing?.data && typeof existing.data === "object"
      ? (existing.data as Record<string, unknown>)
      : {};
  const notes = formData.get("notes");

  const { error } = await supabase
    .from("characters")
    .update({
      name: parsed.data.name,
      ancestry: parsed.data.ancestry ?? null,
      heritage: parsed.data.heritage ?? null,
      background: parsed.data.background ?? null,
      class: parsed.data.characterClass ?? null,
      level: parsed.data.level,
      portrait_url: parsed.data.portraitUrl || null,
      abilities: readAbilities(formData),
      defenses: readDefenses(formData),
      data: {
        ...prevData,
        notes: typeof notes === "string" ? notes : "",
        coins: readCoins(formData),
        languages: readList(formData, "languages"),
        conditions: readList(formData, "conditions"),
      },
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
