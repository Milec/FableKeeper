"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { THREATS } from "./budget";
import type { Json } from "@/types/database";

export interface EncounterActionState {
  error?: string;
}

const combatantSchema = z.object({
  id: z.string(),
  name: z.string().max(120),
  level: z.coerce.number().int().min(-1).max(30),
  count: z.coerce.number().int().min(1).max(50),
  kind: z.enum(["creature", "simple_hazard", "complex_hazard"]),
  adjustment: z.enum(["none", "elite", "weak"]),
  /** Present when the combatant was chosen from the bestiary. */
  source: z.string().max(20).optional(),
});

const encounterSchema = z.object({
  campaignId: z.string().uuid(),
  name: z.string().min(1, "Name is required.").max(200),
  partySize: z.coerce.number().int().min(1).max(12),
  partyLevel: z.coerce.number().int().min(1).max(20),
  targetThreat: z.enum(THREATS),
  notes: z.string().max(5000).optional(),
  combatants: z.array(combatantSchema).max(50),
});

function parse(formData: FormData) {
  let combatants: unknown = [];
  try {
    combatants = JSON.parse((formData.get("combatants") as string) || "[]");
  } catch {
    combatants = [];
  }
  return encounterSchema.safeParse({
    campaignId: formData.get("campaignId"),
    name: formData.get("name"),
    partySize: formData.get("partySize"),
    partyLevel: formData.get("partyLevel"),
    targetThreat: formData.get("targetThreat"),
    notes: formData.get("notes") || undefined,
    combatants,
  });
}

export async function saveEncounter(
  _prev: EncounterActionState,
  formData: FormData,
): Promise<EncounterActionState> {
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
    .from("encounters")
    .insert({
      campaign_id: d.campaignId,
      name: d.name,
      party_size: d.partySize,
      party_level: d.partyLevel,
      target_threat: d.targetThreat,
      combatants: d.combatants as unknown as Json,
      notes: d.notes ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath(`/campaigns/${d.campaignId}/encounters`);
  redirect(`/campaigns/${d.campaignId}/encounters/${data.id}`);
}

export async function updateEncounter(
  _prev: EncounterActionState,
  formData: FormData,
): Promise<EncounterActionState> {
  const encounterId = formData.get("encounterId");
  if (typeof encounterId !== "string") return { error: "Missing encounter id." };
  const parsed = parse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("encounters")
    .update({
      name: d.name,
      party_size: d.partySize,
      party_level: d.partyLevel,
      target_threat: d.targetThreat,
      combatants: d.combatants as unknown as Json,
      notes: d.notes ?? null,
    })
    .eq("id", encounterId);

  if (error) return { error: error.message };
  const base = `/campaigns/${d.campaignId}/encounters/${encounterId}`;
  revalidatePath(base);
  redirect(base);
}

export async function deleteEncounter(formData: FormData): Promise<void> {
  const encounterId = formData.get("encounterId");
  const campaignId = formData.get("campaignId");
  if (typeof encounterId !== "string" || typeof campaignId !== "string") return;
  const supabase = await createClient();
  await supabase.from("encounters").delete().eq("id", encounterId);
  revalidatePath(`/campaigns/${campaignId}/encounters`);
  redirect(`/campaigns/${campaignId}/encounters`);
}
