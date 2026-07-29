"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export interface CampaignActionState {
  error?: string;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

const sessionSchema = z.object({
  campaignId: z.string().uuid(),
  title: z.string().min(1, "Title is required.").max(200),
  sessionDate: z.string().optional(),
  markdown: z.string().max(100_000).optional(),
  isSecret: z.boolean().optional(),
});

export async function createSession(
  _prev: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  const parsed = sessionSchema.safeParse({
    campaignId: formData.get("campaignId"),
    title: formData.get("title"),
    sessionDate: formData.get("sessionDate") || undefined,
    markdown: formData.get("markdown") || undefined,
    isSecret: formData.get("isSecret") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      campaign_id: parsed.data.campaignId,
      title: parsed.data.title,
      session_date: parsed.data.sessionDate || null,
      content: { markdown: parsed.data.markdown ?? "" },
      is_secret: parsed.data.isSecret ?? false,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/campaigns/${parsed.data.campaignId}/sessions`);
  redirect(`/campaigns/${parsed.data.campaignId}/sessions/${data.id}`);
}

export async function updateSession(
  _prev: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  const sessionId = formData.get("sessionId");
  if (typeof sessionId !== "string") return { error: "Missing session id." };
  const parsed = sessionSchema.safeParse({
    campaignId: formData.get("campaignId"),
    title: formData.get("title"),
    sessionDate: formData.get("sessionDate") || undefined,
    markdown: formData.get("markdown") || undefined,
    isSecret: formData.get("isSecret") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("sessions")
    .update({
      title: parsed.data.title,
      session_date: parsed.data.sessionDate || null,
      content: { markdown: parsed.data.markdown ?? "" },
      is_secret: parsed.data.isSecret ?? false,
    })
    .eq("id", sessionId);

  if (error) return { error: error.message };

  const base = `/campaigns/${parsed.data.campaignId}/sessions/${sessionId}`;
  revalidatePath(base);
  redirect(base);
}

export async function deleteSession(formData: FormData): Promise<void> {
  const sessionId = formData.get("sessionId");
  const campaignId = formData.get("campaignId");
  if (typeof sessionId !== "string" || typeof campaignId !== "string") return;
  const supabase = await createClient();
  await supabase.from("sessions").delete().eq("id", sessionId);
  revalidatePath(`/campaigns/${campaignId}/sessions`);
  redirect(`/campaigns/${campaignId}/sessions`);
}

// ---------------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------------

const QUEST_STATUSES = ["active", "completed", "failed", "on_hold"] as const;

const questSchema = z.object({
  campaignId: z.string().uuid(),
  title: z.string().min(1, "Title is required.").max(200),
  markdown: z.string().max(100_000).optional(),
  status: z.enum(QUEST_STATUSES),
  isSecret: z.boolean().optional(),
});

export async function createQuest(
  _prev: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  const parsed = questSchema.safeParse({
    campaignId: formData.get("campaignId"),
    title: formData.get("title"),
    markdown: formData.get("markdown") || undefined,
    status: formData.get("status") || "active",
    isSecret: formData.get("isSecret") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data, error } = await supabase
    .from("quests")
    .insert({
      campaign_id: parsed.data.campaignId,
      title: parsed.data.title,
      content: { markdown: parsed.data.markdown ?? "" },
      status: parsed.data.status,
      is_secret: parsed.data.isSecret ?? false,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/campaigns/${parsed.data.campaignId}/quests`);
  redirect(`/campaigns/${parsed.data.campaignId}/quests/${data.id}`);
}

export async function updateQuest(
  _prev: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  const questId = formData.get("questId");
  if (typeof questId !== "string") return { error: "Missing quest id." };
  const parsed = questSchema.safeParse({
    campaignId: formData.get("campaignId"),
    title: formData.get("title"),
    markdown: formData.get("markdown") || undefined,
    status: formData.get("status") || "active",
    isSecret: formData.get("isSecret") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("quests")
    .update({
      title: parsed.data.title,
      content: { markdown: parsed.data.markdown ?? "" },
      status: parsed.data.status,
      is_secret: parsed.data.isSecret ?? false,
    })
    .eq("id", questId);

  if (error) return { error: error.message };

  const base = `/campaigns/${parsed.data.campaignId}/quests/${questId}`;
  revalidatePath(base);
  redirect(base);
}

export async function deleteQuest(formData: FormData): Promise<void> {
  const questId = formData.get("questId");
  const campaignId = formData.get("campaignId");
  if (typeof questId !== "string" || typeof campaignId !== "string") return;
  const supabase = await createClient();
  await supabase.from("quests").delete().eq("id", questId);
  revalidatePath(`/campaigns/${campaignId}/quests`);
  redirect(`/campaigns/${campaignId}/quests`);
}
