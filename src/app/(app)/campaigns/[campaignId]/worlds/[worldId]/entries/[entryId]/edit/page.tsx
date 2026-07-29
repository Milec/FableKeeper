import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  getCampaignContext,
  getEntry,
  getEntryRefs,
} from "@/lib/world/queries";
import { buildWikiResolver } from "@/lib/world/resolver";
import { can } from "@/lib/permissions";
import { deleteEntry } from "@/lib/world/actions";
import { EntryEditor } from "@/modules/world/entry-editor";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export default async function EditEntryPage({
  params,
}: {
  params: Promise<{ campaignId: string; worldId: string; entryId: string }>;
}) {
  const { campaignId, worldId, entryId } = await params;

  const campaign = await getCampaignContext(campaignId);
  if (!campaign) notFound();
  if (!can(campaign.role, "world:edit")) notFound();
  const entry = await getEntry(entryId);
  if (!entry || entry.world_id !== worldId) notFound();

  const refs = await getEntryRefs(worldId);
  const resolver = buildWikiResolver(campaignId, worldId, refs);
  const entryBase = `/campaigns/${campaignId}/worlds/${worldId}/entries/${entryId}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-2xl font-bold">Edit entry</h1>
      <EntryEditor
        campaignId={campaignId}
        worldId={worldId}
        resolver={resolver}
        entry={entry}
        cancelHref={entryBase}
      />

      <Separator />

      <form action={deleteEntry}>
        <input type="hidden" name="entryId" value={entryId} />
        <input type="hidden" name="campaignId" value={campaignId} />
        <input type="hidden" name="worldId" value={worldId} />
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Deleting an entry is permanent and removes its links.
          </p>
          <Button type="submit" variant="destructive" size="sm">
            <Trash2 className="h-4 w-4" />
            Delete entry
          </Button>
        </div>
      </form>
    </div>
  );
}
