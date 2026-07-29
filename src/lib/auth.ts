import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Campaign, CampaignRole, Profile } from "@/types/database";

export interface CurrentUser {
  id: string;
  email: string | null;
  profile: Profile | null;
}

/** Get the signed-in user, or null. Never throws. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return { id: user.id, email: user.email ?? null, profile };
}

/** Require an authenticated user or redirect to /login. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export interface CampaignWithRole extends Campaign {
  role: CampaignRole;
}

/** List the campaigns the current user belongs to, with their role in each. */
export async function getUserCampaigns(): Promise<CampaignWithRole[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaign_members")
    .select("role, campaigns(*)")
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  return data
    .filter((row) => row.campaigns)
    .map((row) => ({
      ...(row.campaigns as unknown as Campaign),
      role: row.role,
    }));
}
