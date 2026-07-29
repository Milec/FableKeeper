import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Search } from "lucide-react";
import { getCampaignContext } from "@/lib/world/queries";
import { ROLE_LABELS } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "@/components/world/command-palette";

export default async function CampaignLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const campaign = await getCampaignContext(campaignId);
  if (!campaign) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/dashboard" className="hover:text-foreground">
            Campaigns
          </Link>
          <ChevronRight className="h-4 w-4" />
          <Link
            href={`/campaigns/${campaign.id}`}
            className="font-medium text-foreground"
          >
            {campaign.name}
          </Link>
          <Badge variant="secondary">{ROLE_LABELS[campaign.role]}</Badge>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/campaigns/${campaign.id}/search`}>
            <Search className="h-4 w-4" />
            Search
            <kbd className="ml-1 hidden rounded border bg-muted px-1.5 text-[10px] font-medium sm:inline">
              ⌘K
            </kbd>
          </Link>
        </Button>
      </div>

      {children}

      <CommandPalette campaignId={campaign.id} />
    </div>
  );
}
