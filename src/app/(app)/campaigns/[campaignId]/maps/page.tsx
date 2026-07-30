import Link from "next/link";
import { notFound } from "next/navigation";
import { Map as MapIcon } from "lucide-react";
import { getCampaignContext, getWorlds } from "@/lib/world/queries";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AzgaarImport } from "@/modules/maps/azgaar-import";

export default async function MapsPage({
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

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold sm:text-3xl">
          <MapIcon className="h-6 w-6 text-primary" />
          Interactive Maps
        </h1>
        <p className="text-muted-foreground">
          Bring a map in from Azgaar&apos;s Fantasy Map Generator and turn its
          states, cities, cultures, and religions into linked World Builder
          articles.
        </p>
      </div>

      {!canEdit ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Only the GM can import maps into this campaign.
          </CardContent>
        </Card>
      ) : !world ? (
        <Card>
          <CardContent className="space-y-3 py-6">
            <p className="text-sm text-muted-foreground">
              Imported articles need somewhere to live. Create a world first, then
              come back.
            </p>
            <Button asChild>
              <Link href={`/campaigns/${campaignId}`}>Create a world</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <AzgaarImport
          campaignId={campaignId}
          worldId={world.id}
          worldName={world.name}
        />
      )}
    </div>
  );
}
