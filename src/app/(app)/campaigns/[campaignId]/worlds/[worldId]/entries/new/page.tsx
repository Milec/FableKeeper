import { notFound } from "next/navigation";
import {
  getCampaignContext,
  getEntryRefs,
  getWorld,
} from "@/lib/world/queries";
import { buildWikiResolver } from "@/lib/world/resolver";
import { can } from "@/lib/permissions";
import { ALL_ENTRY_TYPES } from "@/lib/world/entry-types";
import type { WorldEntryType } from "@/types/database";
import { EntryEditor } from "@/modules/world/entry-editor";

export default async function NewEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string; worldId: string }>;
  searchParams: Promise<{ type?: string; title?: string }>;
}) {
  const { campaignId, worldId } = await params;
  const { type, title } = await searchParams;

  const campaign = await getCampaignContext(campaignId);
  if (!campaign) notFound();
  if (!can(campaign.role, "world:edit")) notFound();
  const world = await getWorld(worldId);
  if (!world) notFound();

  const refs = await getEntryRefs(worldId);
  const resolver = buildWikiResolver(campaignId, worldId, refs);
  const worldBase = `/campaigns/${campaignId}/worlds/${worldId}`;
  const defaultType = ALL_ENTRY_TYPES.includes(type as WorldEntryType)
    ? (type as WorldEntryType)
    : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-2xl font-bold">New entry</h1>
      <EntryEditor
        campaignId={campaignId}
        worldId={worldId}
        resolver={resolver}
        defaultType={defaultType}
        defaultTitle={title}
        cancelHref={worldBase}
      />
    </div>
  );
}
