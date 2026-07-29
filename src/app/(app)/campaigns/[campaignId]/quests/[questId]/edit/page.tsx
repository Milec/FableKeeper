import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { getCampaignContext } from "@/lib/world/queries";
import { getQuest } from "@/lib/campaign/queries";
import { can } from "@/lib/permissions";
import { deleteQuest } from "@/lib/campaign/actions";
import { QuestForm } from "@/modules/campaign/quest-form";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export default async function EditQuestPage({
  params,
}: {
  params: Promise<{ campaignId: string; questId: string }>;
}) {
  const { campaignId, questId } = await params;
  const campaign = await getCampaignContext(campaignId);
  if (!campaign) notFound();
  if (!can(campaign.role, "quest:edit")) notFound();
  const quest = await getQuest(questId);
  if (!quest || quest.campaign_id !== campaignId) notFound();

  const base = `/campaigns/${campaignId}/quests/${questId}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-2xl font-bold">Edit quest</h1>
      <QuestForm campaignId={campaignId} quest={quest} cancelHref={base} />

      <Separator />

      <form action={deleteQuest}>
        <input type="hidden" name="questId" value={questId} />
        <input type="hidden" name="campaignId" value={campaignId} />
        <div className="flex items-center justify-end">
          <Button type="submit" variant="destructive" size="sm">
            <Trash2 className="h-4 w-4" />
            Delete quest
          </Button>
        </div>
      </form>
    </div>
  );
}
