import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, Search as SearchIcon } from "lucide-react";
import { getCampaignContext, searchEntries } from "@/lib/world/queries";
import { entryTypeMeta } from "@/lib/world/entry-types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { campaignId } = await params;
  const { q } = await searchParams;

  const campaign = await getCampaignContext(campaignId);
  if (!campaign) notFound();

  const term = q?.trim() ?? "";
  const results = term ? await searchEntries(campaignId, term, 50) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-2xl font-bold">Search</h1>

      <form className="flex gap-2">
        <Input
          name="q"
          defaultValue={term}
          placeholder="Search entries by title or summary…"
          autoFocus
          aria-label="Search query"
        />
        <Button type="submit">
          <SearchIcon className="h-4 w-4" />
          Search
        </Button>
      </form>

      {term && (
        <p className="text-sm text-muted-foreground">
          {results.length} result{results.length === 1 ? "" : "s"} for “{term}”
        </p>
      )}

      {term && results.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No entries matched your search.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {results.map((entry) => {
            const meta = entryTypeMeta(entry.type);
            const Icon = meta.icon;
            return (
              <li key={entry.id}>
                <Link
                  href={`/campaigns/${campaignId}/worlds/${entry.world_id}/entries/${entry.id}`}
                  className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
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
  );
}
