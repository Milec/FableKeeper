import type { Metadata } from "next";
import { BookOpen, Users } from "lucide-react";
import { getUserCampaigns, requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/permissions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { CreateCampaignForm } from "./create-campaign-dialog";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const campaigns = await getUserCampaigns();

  const greetingName =
    user.profile?.display_name || user.email?.split("@")[0] || "Keeper";

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">
            Welcome back, {greetingName}
          </h1>
          <p className="text-muted-foreground">
            Your campaigns and tools, all in one place.
          </p>
        </div>
        <CreateCampaignForm />
      </div>

      <section className="space-y-4">
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
          <BookOpen className="h-5 w-5 text-primary" />
          Campaigns
        </h2>

        {campaigns.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <Users className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="font-medium">No campaigns yet</p>
                <p className="text-sm text-muted-foreground">
                  Create your first campaign to start building worlds.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((campaign) => (
              <Card key={campaign.id} className="flex h-full flex-col">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="font-display">
                      {campaign.name}
                    </CardTitle>
                    <Badge variant="secondary">
                      {ROLE_LABELS[campaign.role]}
                    </Badge>
                  </div>
                  {campaign.description && (
                    <CardDescription className="line-clamp-2">
                      {campaign.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="mt-auto text-xs text-muted-foreground">
                  Created {formatDate(campaign.created_at)}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
