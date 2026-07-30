import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, Swords } from "lucide-react";
import { getCampaignContext } from "@/lib/world/queries";
import { getEncounters, encounterCombatants } from "@/lib/encounters/queries";
import { can } from "@/lib/permissions";
import { summarize, THREAT_LABELS, type Threat } from "@/lib/encounters/budget";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default async function EncountersPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const campaign = await getCampaignContext(campaignId);
  if (!campaign) notFound();

  const encounters = await getEncounters(campaignId);
  const canEdit = can(campaign.role, "tool:use") && can(campaign.role, "session:edit");
  const base = `/campaigns/${campaignId}/encounters`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold">
          <Swords className="h-6 w-6 text-primary" />
          Encounters
        </h1>
        {canEdit && (
          <Button asChild>
            <Link href={`${base}/new`}>
              <Plus className="h-4 w-4" />
              Build encounter
            </Link>
          </Button>
        )}
      </div>

      {encounters.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No saved encounters yet.
          </CardContent>
        </Card>
      ) : (
        <ul className="divide-y rounded-lg border">
          {encounters.map((e) => {
            const summary = summarize(
              encounterCombatants(e),
              e.party_size,
              e.party_level,
              (e.target_threat as Threat) ?? "moderate",
            );
            return (
              <li key={e.id}>
                <Link
                  href={`${base}/${e.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{e.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Party {e.party_size} · Level {e.party_level} · {summary.totalXp} XP
                    </p>
                  </div>
                  <Badge variant="secondary">{THREAT_LABELS[summary.rating]}</Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
