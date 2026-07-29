import { notFound } from "next/navigation";
import { getCampaignContext } from "@/lib/world/queries";
import { can } from "@/lib/permissions";
import { EncounterBuilder } from "@/modules/encounters/encounter-builder";

export default async function NewEncounterPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const campaign = await getCampaignContext(campaignId);
  if (!campaign) notFound();
  if (!can(campaign.role, "session:edit")) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="font-display text-2xl font-bold">Build encounter</h1>
      <EncounterBuilder
        campaignId={campaignId}
        cancelHref={`/campaigns/${campaignId}/encounters`}
      />
    </div>
  );
}
