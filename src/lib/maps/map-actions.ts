"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export interface MapImageState {
  error?: string;
}

const schema = z.object({
  campaignId: z.string().uuid(),
  mapId: z.string().uuid(),
  imageUrl: z.string().url().or(z.literal("")),
});

/** Attach (or clear) the picture a map's pins are laid over. */
export async function updateMapImage(
  _prev: MapImageState,
  formData: FormData,
): Promise<MapImageState> {
  const parsed = schema.safeParse({
    campaignId: formData.get("campaignId"),
    mapId: formData.get("mapId"),
    imageUrl: formData.get("imageUrl") || "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  // RLS restricts updates to campaign editors.
  const { error } = await supabase
    .from("maps")
    .update({ image_url: parsed.data.imageUrl || null })
    .eq("id", parsed.data.mapId);

  if (error) return { error: error.message };

  revalidatePath(`/campaigns/${parsed.data.campaignId}/maps/${parsed.data.mapId}`);
  return {};
}
