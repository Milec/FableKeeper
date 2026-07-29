import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, Pencil } from "lucide-react";
import {
  getBacklinks,
  getCampaignContext,
  getEntry,
  getEntryRefs,
  entryMarkdown,
} from "@/lib/world/queries";
import { buildWikiResolver } from "@/lib/world/resolver";
import { entryTypeMeta } from "@/lib/world/entry-types";
import { can } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { EntryContent } from "@/components/world/entry-content";

export default async function EntryPage({
  params,
}: {
  params: Promise<{ campaignId: string; worldId: string; entryId: string }>;
}) {
  const { campaignId, worldId, entryId } = await params;

  const campaign = await getCampaignContext(campaignId);
  if (!campaign) notFound();
  const entry = await getEntry(entryId);
  if (!entry || entry.world_id !== worldId) notFound();

  const [refs, backlinks] = await Promise.all([
    getEntryRefs(worldId),
    getBacklinks(entryId),
  ]);
  const resolver = buildWikiResolver(campaignId, worldId, refs);
  const meta = entryTypeMeta(entry.type);
  const canEdit = can(campaign.role, "world:edit");
  const worldBase = `/campaigns/${campaignId}/worlds/${worldId}`;
  const Icon = meta.icon;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href={worldBase}>
          <ArrowLeft className="h-4 w-4" />
          Back to world
        </Link>
      </Button>

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="h-4 w-4" />
          <span>{meta.label}</span>
          {entry.is_secret && (
            <Badge variant="secondary" className="gap-1">
              <Lock className="h-3 w-3" /> GM secret
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="font-display text-3xl font-bold">{entry.title}</h1>
          {canEdit && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`${worldBase}/entries/${entryId}/edit`}>
                <Pencil className="h-4 w-4" />
                Edit
              </Link>
            </Button>
          )}
        </div>
        {entry.summary && (
          <p className="text-lg text-muted-foreground">{entry.summary}</p>
        )}
        {entry.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {entry.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                #{tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <Separator />

      <EntryContent markdown={entryMarkdown(entry)} resolver={resolver} />

      {backlinks.length > 0 && (
        <>
          <Separator />
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Linked from ({backlinks.length})
            </h2>
            <ul className="space-y-1">
              {backlinks.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`${worldBase}/entries/${b.id}`}
                    className="text-sm text-primary hover:underline"
                  >
                    {b.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Last updated {formatDate(entry.updated_at)}
      </p>
    </div>
  );
}
