import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { getCampaignContext } from "@/lib/world/queries";
import { getEncounter } from "@/lib/encounters/queries";
import { can } from "@/lib/permissions";
import { deleteEncounter } from "@/lib/encounters/actions";
import { EncounterBuilder } from "@/modules/encounters/encounter-builder";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export default async function EditEncounterPage({
  params,
}: {
  params: Promise<{ campaignId: string; encounterId: string }>;
}) {
  const { campaignId, encounterId } = await params;
  const campaign = await getCampaignContext(campaignId);
  if (!campaign) notFound();
  if (!can(campaign.role, "session:edit")) notFound();
  const encounter = await getEncounter(encounterId);
  if (!encounter || encounter.campaign_id !== campaignId) notFound();

  const base = `/campaigns/${campaignId}/encounters/${encounterId}`;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="font-display text-2xl font-bold">Edit encounter</h1>
      <EncounterBuilder campaignId={campaignId} encounter={encounter} cancelHref={base} />

      <Separator />

      <form action={deleteEncounter}>
        <input type="hidden" name="encounterId" value={encounterId} />
        <input type="hidden" name="campaignId" value={campaignId} />
        <div className="flex items-center justify-end">
          <Button type="submit" variant="destructive" size="sm">
            <Trash2 className="h-4 w-4" />
            Delete encounter
          </Button>
        </div>
      </form>
    </div>
  );
}
