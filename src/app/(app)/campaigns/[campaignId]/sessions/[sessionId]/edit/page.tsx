import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { getCampaignContext } from "@/lib/world/queries";
import { getSession } from "@/lib/campaign/queries";
import { can } from "@/lib/permissions";
import { deleteSession } from "@/lib/campaign/actions";
import { SessionForm } from "@/modules/campaign/session-form";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export default async function EditSessionPage({
  params,
}: {
  params: Promise<{ campaignId: string; sessionId: string }>;
}) {
  const { campaignId, sessionId } = await params;
  const campaign = await getCampaignContext(campaignId);
  if (!campaign) notFound();
  if (!can(campaign.role, "session:edit")) notFound();
  const session = await getSession(sessionId);
  if (!session || session.campaign_id !== campaignId) notFound();

  const base = `/campaigns/${campaignId}/sessions/${sessionId}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-2xl font-bold">Edit session</h1>
      <SessionForm campaignId={campaignId} session={session} cancelHref={base} />

      <Separator />

      <form action={deleteSession}>
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="campaignId" value={campaignId} />
        <div className="flex items-center justify-end">
          <Button type="submit" variant="destructive" size="sm">
            <Trash2 className="h-4 w-4" />
            Delete session
          </Button>
        </div>
      </form>
    </div>
  );
}
