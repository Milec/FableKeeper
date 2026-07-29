import type { Metadata } from "next";
import Link from "next/link";
import { Globe2 } from "lucide-react";
import { getCampaignContext, getWorlds } from "@/lib/world/queries";
import { can } from "@/lib/permissions";
import { notFound } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CreateWorldForm } from "@/modules/world/create-world-form";

export const metadata: Metadata = { title: "Campaign" };

export default async function CampaignOverviewPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const campaign = await getCampaignContext(campaignId);
  if (!campaign) notFound();

  const worlds = await getWorlds(campaignId);
  const canEdit = can(campaign.role, "world:edit");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold">{campaign.name}</h1>
        {campaign.description && (
          <p className="mt-1 text-muted-foreground">{campaign.description}</p>
        )}
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
            <Globe2 className="h-5 w-5 text-primary" />
            Worlds
          </h2>
          {canEdit && <CreateWorldForm campaignId={campaignId} />}
        </div>

        {worlds.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <Globe2 className="h-10 w-10 text-muted-foreground" />
              <p className="font-medium">No worlds yet</p>
              <p className="text-sm text-muted-foreground">
                {canEdit
                  ? "Create a world to start building its regions, NPCs, and lore."
                  : "The Game Master hasn't shared any worlds yet."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {worlds.map((world) => (
              <Link key={world.id} href={`/campaigns/${campaignId}/worlds/${world.id}`}>
                <Card className="h-full transition-colors hover:border-primary/50">
                  <CardHeader>
                    <CardTitle className="font-display">{world.name}</CardTitle>
                    {world.description && (
                      <CardDescription className="line-clamp-2">
                        {world.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
