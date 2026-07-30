import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCampaignContext } from "@/lib/world/queries";
import { getMap, getMapPins } from "@/lib/maps/queries";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { MapViewer, type ViewerPin } from "@/modules/maps/map-viewer";
import { MapImageForm } from "@/modules/maps/map-image-form";

export default async function MapPage({
  params,
}: {
  params: Promise<{ campaignId: string; mapId: string }>;
}) {
  const { campaignId, mapId } = await params;
  const campaign = await getCampaignContext(campaignId);
  if (!campaign) notFound();

  const map = await getMap(mapId);
  if (!map || map.campaign_id !== campaignId) notFound();

  const pins = await getMapPins(mapId);
  const canReveal = can(campaign.role, "map:reveal");
  const canEdit = can(campaign.role, "map:edit");

  const viewerPins: ViewerPin[] = pins.map((pin) => ({
    id: pin.id,
    label: pin.label,
    kind: pin.kind,
    x: pin.x,
    y: pin.y,
    is_revealed: pin.is_revealed,
    href:
      pin.entry_id && pin.entry_world_id
        ? `/campaigns/${campaignId}/worlds/${pin.entry_world_id}/entries/${pin.entry_id}`
        : null,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href={`/campaigns/${campaignId}/maps`}>
          <ArrowLeft className="h-4 w-4" />
          Maps
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[12rem] flex-1">
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{map.name}</h1>
          {map.description && (
            <p className="text-muted-foreground">{map.description}</p>
          )}
        </div>
        {canEdit && (
          <div className="w-full sm:w-80">
            <MapImageForm
              campaignId={campaignId}
              mapId={mapId}
              currentUrl={map.image_url}
            />
          </div>
        )}
      </div>

      <MapViewer
        mapId={mapId}
        mapName={map.name}
        imageUrl={map.image_url}
        pins={viewerPins}
        canReveal={canReveal}
      />
    </div>
  );
}
