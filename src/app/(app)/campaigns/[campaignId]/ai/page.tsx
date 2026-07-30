import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";
import { getCampaignContext, getWorlds } from "@/lib/world/queries";
import { getCampaignStats } from "@/lib/campaign/overview";
import { isAiConfigured } from "@/lib/ai/actions";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AssistForm } from "@/modules/ai/assist-form";

export default async function AiAssistPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const campaign = await getCampaignContext(campaignId);
  if (!campaign) notFound();

  const canEdit = can(campaign.role, "world:edit");
  const worlds = await getWorlds(campaignId);
  const world = worlds[0];
  const stats = await getCampaignStats(campaignId);
  const configured = await isAiConfigured();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold sm:text-3xl">
          <Sparkles className="h-6 w-6 text-primary" />
          AI Assist
        </h1>
        <p className="text-muted-foreground">
          Draft lore, NPCs, and locations that fit the world you&apos;ve already
          built — the assistant reads your entries and links to them.
        </p>
      </div>

      {!canEdit ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Only the GM can draft new lore for this campaign.
          </CardContent>
        </Card>
      ) : !world ? (
        <Card>
          <CardContent className="space-y-3 py-6">
            <p className="text-sm text-muted-foreground">
              Drafts need somewhere to live. Create a world first.
            </p>
            <Button asChild>
              <Link href={`/campaigns/${campaignId}`}>Create a world</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <AssistForm
          campaignId={campaignId}
          worldId={world.id}
          worldName={world.name}
          entryCount={stats.entries}
          configured={configured}
        />
      )}
    </div>
  );
}
