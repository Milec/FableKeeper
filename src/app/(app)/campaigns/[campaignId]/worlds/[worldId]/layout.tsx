import { notFound } from "next/navigation";
import {
  getCampaignContext,
  getEntryRefs,
  getWorld,
  getWorlds,
} from "@/lib/world/queries";
import { can } from "@/lib/permissions";
import { WorldTree } from "@/components/world/world-tree";

/**
 * World Builder shell.
 *
 * Hosts the persistent navigator so every entry, type, and world stays one click
 * away from wherever you are — rather than the old flow, which only exposed the
 * type filters on the world index page.
 */
export default async function WorldLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ campaignId: string; worldId: string }>;
}) {
  const { campaignId, worldId } = await params;

  const campaign = await getCampaignContext(campaignId);
  if (!campaign) notFound();
  const world = await getWorld(worldId);
  if (!world || world.campaign_id !== campaignId) notFound();

  const [worlds, entries] = await Promise.all([
    getWorlds(campaignId),
    getEntryRefs(worldId),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)]">
        <WorldTree
          campaignId={campaignId}
          worlds={worlds}
          currentWorldId={worldId}
          entries={entries}
          canEdit={can(campaign.role, "world:edit")}
        />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
