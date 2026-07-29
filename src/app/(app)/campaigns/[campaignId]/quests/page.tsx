import Link from "next/link";
import { notFound } from "next/navigation";
import { ListChecks, Lock, Plus } from "lucide-react";
import { getCampaignContext } from "@/lib/world/queries";
import { getQuests } from "@/lib/campaign/queries";
import { can } from "@/lib/permissions";
import {
  QUEST_STATUS_LABELS,
  QUEST_STATUS_ORDER,
  questStatusVariant,
} from "@/modules/campaign/quest-status";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default async function QuestsPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const campaign = await getCampaignContext(campaignId);
  if (!campaign) notFound();

  const quests = await getQuests(campaignId);
  const canEdit = can(campaign.role, "quest:edit");
  const base = `/campaigns/${campaignId}/quests`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold">
          <ListChecks className="h-6 w-6 text-primary" />
          Quests
        </h1>
        {canEdit && (
          <Button asChild>
            <Link href={`${base}/new`}>
              <Plus className="h-4 w-4" />
              New quest
            </Link>
          </Button>
        )}
      </div>

      {quests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No quests yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {QUEST_STATUS_ORDER.map((status) => {
            const group = quests.filter((q) => q.status === status);
            if (group.length === 0) return null;
            return (
              <section key={status} className="space-y-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {QUEST_STATUS_LABELS[status]}
                  <span className="text-xs">({group.length})</span>
                </h2>
                <ul className="divide-y rounded-lg border">
                  {group.map((q) => (
                    <li key={q.id}>
                      <Link
                        href={`${base}/${q.id}`}
                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent"
                      >
                        <span className="flex-1 truncate font-medium">
                          {q.title}
                        </span>
                        {q.is_secret && (
                          <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
                        )}
                        <Badge variant={questStatusVariant(q.status)}>
                          {QUEST_STATUS_LABELS[q.status]}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
