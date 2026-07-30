import Link from "next/link";
import { notFound } from "next/navigation";
import { Map as MapIcon } from "lucide-react";
import { getCampaignContext, getWorlds } from "@/lib/world/queries";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AzgaarImport } from "@/modules/maps/azgaar-import";
import { getMaps } from "@/lib/maps/queries";

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
  const maps = await getMaps(campaignId);

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

      {maps.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Your maps</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {maps.map((m) => (
              <Link
                key={m.id}
                href={`/campaigns/${campaignId}/maps/${m.id}`}
                className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
              >
                <MapIcon className="h-5 w-5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{m.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {m.image_url ? "Open the map" : "No image yet — add one"}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

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
