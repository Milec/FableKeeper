import { notFound } from "next/navigation";
import { getCampaignContext } from "@/lib/world/queries";
import { can } from "@/lib/permissions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CharacterForm } from "@/modules/characters/character-form";
import { PathbuilderImport } from "@/modules/characters/pathbuilder-import";

export default async function NewCharacterPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const campaign = await getCampaignContext(campaignId);
  if (!campaign) notFound();
  if (!can(campaign.role, "character:edit_own")) notFound();

  const base = `/campaigns/${campaignId}/characters`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-2xl font-bold">New character</h1>
      <Tabs defaultValue="manual">
        <TabsList>
          <TabsTrigger value="manual">Build manually</TabsTrigger>
          <TabsTrigger value="pathbuilder">Import from Pathbuilder</TabsTrigger>
        </TabsList>
        <TabsContent value="manual" className="pt-4">
          <CharacterForm campaignId={campaignId} cancelHref={base} />
        </TabsContent>
        <TabsContent value="pathbuilder" className="pt-4">
          <PathbuilderImport campaignId={campaignId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
