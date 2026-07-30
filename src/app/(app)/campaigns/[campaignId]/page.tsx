import type { Metadata } from "next";
import Link from "next/link";
import {
  BookOpen,
  Dices,
  Globe2,
  ListChecks,
  Map as MapIcon,
  ScrollText,
  Swords,
  Users,
} from "lucide-react";
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
import { getCampaignStats } from "@/lib/campaign/overview";

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
  const stats = await getCampaignStats(campaignId);

  // Counts run through RLS as the signed-in user, so a Player's totals exclude
  // GM secrets rather than hinting at how much is hidden.
  const tiles = [
    { href: "world", icon: BookOpen, label: "Entries", value: stats.entries },
    { href: "characters", icon: Users, label: "Characters", value: stats.characters },
    { href: "sessions", icon: ScrollText, label: "Sessions", value: stats.sessions },
    { href: "quests", icon: ListChecks, label: "Active quests", value: stats.openQuests },
    { href: "encounters", icon: Swords, label: "Encounters", value: stats.encounters },
    { href: "tables", icon: Dices, label: "Tables", value: stats.tables },
    { href: "maps", icon: MapIcon, label: "Maps", value: stats.maps },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold">{campaign.name}</h1>
        {campaign.description && (
          <p className="mt-1 text-muted-foreground">{campaign.description}</p>
        )}
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {tiles.map(({ href, icon: Icon, label, value }) => (
          <Link
            key={href}
            href={`/campaigns/${campaignId}/${href}`}
            className="rounded-lg border p-3 transition-colors hover:border-primary/50 hover:bg-muted/40"
          >
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
              {label}
            </span>
            <span className="mt-0.5 block font-display text-2xl font-bold tabular-nums">
              {value.toLocaleString()}
            </span>
          </Link>
        ))}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
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
