import { notFound } from "next/navigation";
import { getCampaignContext } from "@/lib/world/queries";
import { can } from "@/lib/permissions";
import { SessionForm } from "@/modules/campaign/session-form";

export default async function NewSessionPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const campaign = await getCampaignContext(campaignId);
  if (!campaign) notFound();
  if (!can(campaign.role, "session:edit")) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-2xl font-bold">New session</h1>
      <SessionForm
        campaignId={campaignId}
        cancelHref={`/campaigns/${campaignId}/sessions`}
      />
    </div>
  );
}
