import { notFound } from "next/navigation";
import { getCampaignContext } from "@/lib/world/queries";
import { can } from "@/lib/permissions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TableEditor } from "@/modules/tables/table-editor";
import { TableImport } from "@/modules/tables/table-import";

export default async function NewTablePage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const campaign = await getCampaignContext(campaignId);
  if (!campaign) notFound();
  if (!can(campaign.role, "table:edit")) notFound();

  const base = `/campaigns/${campaignId}/tables`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-2xl font-bold">New rollable table</h1>
      <Tabs defaultValue="build">
        <TabsList>
          <TabsTrigger value="build">Build</TabsTrigger>
          <TabsTrigger value="import">Import JSON</TabsTrigger>
        </TabsList>
        <TabsContent value="build" className="pt-4">
          <TableEditor campaignId={campaignId} cancelHref={base} />
        </TabsContent>
        <TabsContent value="import" className="pt-4">
          <TableImport campaignId={campaignId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
