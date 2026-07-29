import { notFound } from "next/navigation";
import { getCampaignContext } from "@/lib/world/queries";
import { can } from "@/lib/permissions";
import { QuestForm } from "@/modules/campaign/quest-form";

export default async function NewQuestPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const campaign = await getCampaignContext(campaignId);
  if (!campaign) notFound();
  if (!can(campaign.role, "quest:edit")) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-2xl font-bold">New quest</h1>
      <QuestForm
        campaignId={campaignId}
        cancelHref={`/campaigns/${campaignId}/quests`}
      />
    </div>
  );
}
