import Link from "next/link";
import { notFound } from "next/navigation";
import { Dices, Plus } from "lucide-react";
import { getCampaignContext } from "@/lib/world/queries";
import { getRollTables, tableEntries } from "@/lib/tables/queries";
import { tableFormula } from "@/lib/tables/roll";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default async function TablesPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const campaign = await getCampaignContext(campaignId);
  if (!campaign) notFound();

  const tables = await getRollTables(campaignId);
  const canEdit = can(campaign.role, "table:edit");
  const base = `/campaigns/${campaignId}/tables`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold">
          <Dices className="h-6 w-6 text-primary" />
          Rollable Tables
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/tools/tables">Built-in tables</Link>
          </Button>
          {canEdit && (
            <Button asChild>
              <Link href={`${base}/new`}>
                <Plus className="h-4 w-4" />
                New table
              </Link>
            </Button>
          )}
        </div>
      </div>

      {tables.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No custom tables yet. Create one, import JSON, or use the built-in tables.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tables.map((t) => (
            <Link key={t.id} href={`${base}/${t.id}`}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display font-semibold">{t.name}</p>
                    <Badge variant="secondary" className="font-mono">
                      {tableFormula(tableEntries(t))}
                    </Badge>
                  </div>
                  {t.description && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{t.description}</p>
                  )}
                  {t.folder && <p className="text-xs text-muted-foreground">📁 {t.folder}</p>}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
