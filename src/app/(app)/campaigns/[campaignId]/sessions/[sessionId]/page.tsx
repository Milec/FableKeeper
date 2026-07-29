import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, Pencil } from "lucide-react";
import { getCampaignContext } from "@/lib/world/queries";
import { getSession, contentMarkdown } from "@/lib/campaign/queries";
import { can } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { EntryContent } from "@/components/world/entry-content";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ campaignId: string; sessionId: string }>;
}) {
  const { campaignId, sessionId } = await params;
  const campaign = await getCampaignContext(campaignId);
  if (!campaign) notFound();
  const session = await getSession(sessionId);
  if (!session || session.campaign_id !== campaignId) notFound();

  const canEdit = can(campaign.role, "session:edit");
  const base = `/campaigns/${campaignId}/sessions`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href={base}>
          <ArrowLeft className="h-4 w-4" />
          Sessions
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl font-bold">
            {session.title}
            {session.is_secret && (
              <Badge variant="secondary" className="gap-1">
                <Lock className="h-3 w-3" /> GM
              </Badge>
            )}
          </h1>
          {session.session_date && (
            <p className="text-muted-foreground">
              {formatDate(session.session_date)}
            </p>
          )}
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`${base}/${sessionId}/edit`}>
              <Pencil className="h-4 w-4" />
              Edit
            </Link>
          </Button>
        )}
      </div>

      <Separator />

      <EntryContent
        markdown={contentMarkdown(session.content)}
        resolver={{ hrefBySlug: {} }}
      />
    </div>
  );
}
