import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Pencil } from "lucide-react";
import { getCampaignContext } from "@/lib/world/queries";
import { getRollTable, tableEntries } from "@/lib/tables/queries";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableRoller } from "@/modules/tables/table-roller";

export default async function TablePage({
  params,
}: {
  params: Promise<{ campaignId: string; tableId: string }>;
}) {
  const { campaignId, tableId } = await params;
  const campaign = await getCampaignContext(campaignId);
  if (!campaign) notFound();
  const table = await getRollTable(tableId);
  if (!table || table.campaign_id !== campaignId) notFound();

  const entries = tableEntries(table);
  const canEdit = can(campaign.role, "table:edit");
  const base = `/campaigns/${campaignId}/tables`;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href={base}>
          <ArrowLeft className="h-4 w-4" />
          Tables
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">{table.name}</h1>
          {table.description && <p className="text-muted-foreground">{table.description}</p>}
          {table.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {table.tags.map((t) => (
                <Badge key={t} variant="outline">#{t}</Badge>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={`${base}/${tableId}/export`} download>
              <Download className="h-4 w-4" />
              Export
            </a>
          </Button>
          {canEdit && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`${base}/${tableId}/edit`}>
                <Pencil className="h-4 w-4" />
                Edit
              </Link>
            </Button>
          )}
        </div>
      </div>

      <TableRoller entries={entries} />
    </div>
  );
}
