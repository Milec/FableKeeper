import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Plus, User, Users } from "lucide-react";
import { getCampaignContext } from "@/lib/world/queries";
import { getCharacters } from "@/lib/characters/queries";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default async function CharactersPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const campaign = await getCampaignContext(campaignId);
  if (!campaign) notFound();

  const characters = await getCharacters(campaignId);
  const canCreate = can(campaign.role, "character:edit_own");
  const base = `/campaigns/${campaignId}/characters`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold">
          <Users className="h-6 w-6 text-primary" />
          Characters
        </h1>
        {canCreate && (
          <Button asChild>
            <Link href={`${base}/new`}>
              <Plus className="h-4 w-4" />
              New character
            </Link>
          </Button>
        )}
      </div>

      {characters.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <User className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">No characters yet</p>
            <p className="text-sm text-muted-foreground">
              Create a character or import one from Pathbuilder.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {characters.map((c) => (
            <Link key={c.id} href={`${base}/${c.id}`}>
              <Card className="flex h-full items-center gap-4 p-4 transition-colors hover:border-primary/50">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border bg-muted">
                  {c.portrait_url ? (
                    <Image
                      src={c.portrait_url}
                      alt=""
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <User className="h-7 w-7 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display font-semibold">{c.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {[c.ancestry, c.class].filter(Boolean).join(" ") || "—"}
                  </p>
                  <Badge variant="secondary" className="mt-1">
                    Level {c.level}
                  </Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
