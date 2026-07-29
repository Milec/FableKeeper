import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, Pencil } from "lucide-react";
import { getCampaignContext } from "@/lib/world/queries";
import { getQuest, contentMarkdown } from "@/lib/campaign/queries";
import { can } from "@/lib/permissions";
import {
  QUEST_STATUS_LABELS,
  questStatusVariant,
} from "@/modules/campaign/quest-status";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { EntryContent } from "@/components/world/entry-content";

export default async function QuestPage({
  params,
}: {
  params: Promise<{ campaignId: string; questId: string }>;
}) {
  const { campaignId, questId } = await params;
  const campaign = await getCampaignContext(campaignId);
  if (!campaign) notFound();
  const quest = await getQuest(questId);
  if (!quest || quest.campaign_id !== campaignId) notFound();

  const canEdit = can(campaign.role, "quest:edit");
  const base = `/campaigns/${campaignId}/quests`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href={base}>
          <ArrowLeft className="h-4 w-4" />
          Quests
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h1 className="flex items-center gap-2 font-display text-3xl font-bold">
            {quest.title}
            {quest.is_secret && (
              <Badge variant="secondary" className="gap-1">
                <Lock className="h-3 w-3" /> GM
              </Badge>
            )}
          </h1>
          <Badge variant={questStatusVariant(quest.status)}>
            {QUEST_STATUS_LABELS[quest.status]}
          </Badge>
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`${base}/${questId}/edit`}>
              <Pencil className="h-4 w-4" />
              Edit
            </Link>
          </Button>
        )}
      </div>

      <Separator />

      <EntryContent
        markdown={contentMarkdown(quest.content)}
        resolver={{ hrefBySlug: {} }}
      />
    </div>
  );
}
