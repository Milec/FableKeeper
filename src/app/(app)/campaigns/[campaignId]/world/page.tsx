import { notFound, redirect } from "next/navigation";
import { getCampaignContext, getWorlds } from "@/lib/world/queries";

/**
 * World Builder entry point.
 *
 * The sidebar links here rather than at a specific world, so "World Builder"
 * always lands somewhere useful: straight into the world when there's one (the
 * common case), or the campaign overview to pick/create one otherwise. This
 * removes the old campaign → world drill-down before anything was reachable.
 */
export default async function WorldResolverPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const campaign = await getCampaignContext(campaignId);
  if (!campaign) notFound();

  const worlds = await getWorlds(campaignId);
  if (worlds.length > 0) {
    redirect(`/campaigns/${campaignId}/worlds/${worlds[0]!.id}`);
  }
  // No world yet — the campaign overview hosts the "New world" flow.
  redirect(`/campaigns/${campaignId}`);
}
