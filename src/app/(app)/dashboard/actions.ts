"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";

const createCampaignSchema = z.object({
  name: z.string().min(1, "Name is required.").max(120),
  description: z.string().max(2000).optional(),
});

export interface CreateCampaignState {
  error?: string;
}

/** Create a campaign owned by the current user. */
export async function createCampaign(
  _prev: CreateCampaignState,
  formData: FormData,
): Promise<CreateCampaignState> {
  const parsed = createCampaignSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const baseSlug = slugify(parsed.data.name) || "campaign";
  // Ensure per-owner slug uniqueness by appending a short suffix if needed.
  const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;

  const { error } = await supabase.from("campaigns").insert({
    owner_id: user.id,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    slug,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return {};
}
