import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { getCampaignContext } from "@/lib/world/queries";
import { getRollTable } from "@/lib/tables/queries";
import { can } from "@/lib/permissions";
import { deleteRollTable } from "@/lib/tables/actions";
import { TableEditor } from "@/modules/tables/table-editor";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export default async function EditTablePage({
  params,
}: {
  params: Promise<{ campaignId: string; tableId: string }>;
}) {
  const { campaignId, tableId } = await params;
  const campaign = await getCampaignContext(campaignId);
  if (!campaign) notFound();
  if (!can(campaign.role, "table:edit")) notFound();
  const table = await getRollTable(tableId);
  if (!table || table.campaign_id !== campaignId) notFound();

  const base = `/campaigns/${campaignId}/tables/${tableId}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-2xl font-bold">Edit table</h1>
      <TableEditor campaignId={campaignId} table={table} cancelHref={base} />

      <Separator />

      <form action={deleteRollTable}>
        <input type="hidden" name="tableId" value={tableId} />
        <input type="hidden" name="campaignId" value={campaignId} />
        <div className="flex items-center justify-end">
          <Button type="submit" variant="destructive" size="sm">
            <Trash2 className="h-4 w-4" />
            Delete table
          </Button>
        </div>
      </form>
    </div>
  );
}
