import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, Plus, ScrollText } from "lucide-react";
import { getCampaignContext } from "@/lib/world/queries";
import { getSessions } from "@/lib/campaign/queries";
import { can } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default async function SessionsPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const campaign = await getCampaignContext(campaignId);
  if (!campaign) notFound();

  const sessions = await getSessions(campaignId);
  const canEdit = can(campaign.role, "session:edit");
  const base = `/campaigns/${campaignId}/sessions`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold">
          <ScrollText className="h-6 w-6 text-primary" />
          Sessions
        </h1>
        {canEdit && (
          <Button asChild>
            <Link href={`${base}/new`}>
              <Plus className="h-4 w-4" />
              New session
            </Link>
          </Button>
        )}
      </div>

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No sessions logged yet.
          </CardContent>
        </Card>
      ) : (
        <ul className="divide-y rounded-lg border">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link
                href={`${base}/${s.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium">
                    <span className="truncate">{s.title}</span>
                    {s.is_secret && (
                      <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
                    )}
                  </p>
                  {s.session_date && (
                    <p className="text-sm text-muted-foreground">
                      {formatDate(s.session_date)}
                    </p>
                  )}
                </div>
                {s.is_secret && <Badge variant="secondary">GM</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
