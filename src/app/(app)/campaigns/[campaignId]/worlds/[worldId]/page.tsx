import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, Plus } from "lucide-react";
import {
  getCampaignContext,
  getEntries,
  getEntryRefs,
  getWorld,
} from "@/lib/world/queries";
import { can } from "@/lib/permissions";
import {
  ENTRY_CATEGORIES,
  entryTypeMeta,
  entryTypesByCategory,
} from "@/lib/world/entry-types";
import type { WorldEntryType } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
  const [entries, refs] = await Promise.all([
    getEntries(worldId, activeType ? { type: activeType } : {}),
    getEntryRefs(worldId),
  ]);

  const counts = refs.reduce<Record<string, number>>((acc, r) => {
    acc[r.type] = (acc[r.type] ?? 0) + 1;
    return acc;
  }, {});
  const canEdit = can(campaign.role, "world:edit");
  const grouped = entryTypesByCategory();
  const worldBase = `/campaigns/${campaignId}/worlds/${worldId}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">{world.name}</h1>
          {world.description && (
            <p className="text-muted-foreground">{world.description}</p>
          )}
        </div>
        {canEdit && (
          <Button asChild>
            <Link href={`${worldBase}/entries/new${activeType ? `?type=${activeType}` : ""}`}>
              <Plus className="h-4 w-4" />
              New entry
            </Link>
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        {/* Type filter sidebar */}
        <aside className="space-y-4">
          <Link
            href={worldBase}
            className={cn(
              "block rounded-md px-3 py-1.5 text-sm font-medium",
              !activeType ? "bg-primary/10 text-primary" : "hover:bg-accent",
            )}
          >
            All entries
            <span className="ml-1 text-muted-foreground">({refs.length})</span>
          </Link>
          {ENTRY_CATEGORIES.map((category) => {
            const types = grouped[category].filter((m) => counts[m.type]);
            if (types.length === 0) return null;
            return (
              <div key={category}>
                <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {category}
                </p>
                <div className="space-y-0.5">
                  {types.map((meta) => {
                    const active = activeType === meta.type;
                    const Icon = meta.icon;
                    return (
                      <Link
                        key={meta.type}
                        href={`${worldBase}?type=${meta.type}`}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm",
                          active
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1 truncate">{meta.plural}</span>
                        <span className="text-xs">{counts[meta.type]}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </aside>

        {/* Entry list */}
        <div className="space-y-3">
          {activeType && (
            <h2 className="font-display text-lg font-semibold">
              {entryTypeMeta(activeType).plural}
            </h2>
          )}
          {entries.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                {canEdit
                  ? "No entries yet. Create your first one."
                  : "Nothing here yet."}
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
      </div>
    </div>
  );
}
