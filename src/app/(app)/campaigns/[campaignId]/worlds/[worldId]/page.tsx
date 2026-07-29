import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, Plus } from "lucide-react";
import {
  getCampaignContext,
  getEntries,
  getWorld,
} from "@/lib/world/queries";
import { can } from "@/lib/permissions";
import { entryTypeMeta } from "@/lib/world/entry-types";
import type { WorldEntryType } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

/**
 * World index. Navigation lives in the layout's tree, so this page is the
 * content list — everything, or one type when `?type=` is set.
 */
export default async function WorldPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string; worldId: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { campaignId, worldId } = await params;
  const { type } = await searchParams;

  const campaign = await getCampaignContext(campaignId);
  if (!campaign) notFound();
  const world = await getWorld(worldId);
  if (!world) notFound();

  const activeType = type as WorldEntryType | undefined;
  const entries = await getEntries(worldId, activeType ? { type: activeType } : {});
  const canEdit = can(campaign.role, "world:edit");
  const worldBase = `/campaigns/${campaignId}/worlds/${worldId}`;

  const heading = activeType ? entryTypeMeta(activeType).plural : world.name;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">{heading}</h1>
          {activeType ? (
            <p className="text-muted-foreground">
              {entries.length} entr{entries.length === 1 ? "y" : "ies"} in {world.name}
            </p>
          ) : (
            world.description && (
              <p className="text-muted-foreground">{world.description}</p>
            )
          )}
        </div>
        {canEdit && (
          <Button asChild>
            <Link
              href={`${worldBase}/entries/new${activeType ? `?type=${activeType}` : ""}`}
            >
              <Plus className="h-4 w-4" />
              New entry
            </Link>
          </Button>
        )}
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <p className="font-medium">
              {activeType ? `No ${heading.toLowerCase()} yet` : "This world is empty"}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {canEdit
                ? "Create an entry and it appears in the navigator on the left. New entries start from a template for their type."
                : "The Game Master hasn't shared anything here yet."}
            </p>
            {canEdit && (
              <Button asChild className="mt-2">
                <Link
                  href={`${worldBase}/entries/new${activeType ? `?type=${activeType}` : ""}`}
                >
                  <Plus className="h-4 w-4" />
                  Create the first entry
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <ul className="divide-y rounded-lg border">
          {entries.map((entry) => {
            const meta = entryTypeMeta(entry.type);
            const Icon = meta.icon;
            return (
              <li key={entry.id}>
                <Link
                  href={`${worldBase}/entries/${entry.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium">
                      <span className="truncate">{entry.title}</span>
                      {entry.is_secret && (
                        <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
                      )}
                    </p>
                    {entry.summary && (
                      <p className="truncate text-sm text-muted-foreground">
                        {entry.summary}
                      </p>
                    )}
                  </div>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                    {formatDate(entry.updated_at)}
                  </span>
                  <Badge variant="secondary" className="shrink-0">
                    {meta.label}
                  </Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
