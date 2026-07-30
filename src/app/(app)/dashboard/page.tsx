import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Dices, Store, Users, Wand2 } from "lucide-react";
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
import { formatDate, greetingName } from "@/lib/utils";
import { CreateCampaignForm } from "./create-campaign-dialog";

export const metadata: Metadata = { title: "Dashboard" };

/** Tools that work without picking a campaign first. */
const QUICK_TOOLS = [
  { href: "/tools/dice", icon: Dices, title: "Dice Roller", body: "Any formula, animated" },
  { href: "/tools/generators", icon: Wand2, title: "Generators", body: "NPCs, names, backstories" },
  { href: "/tools/shops", icon: Store, title: "Shop Generator", body: "Keepers and inventory" },
] as const;

export default async function DashboardPage() {
  const user = await requireUser();
  const campaigns = await getUserCampaigns();

  const name = greetingName(user.profile?.display_name, user.email);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">
            Welcome back, {name}
          </h1>
          <p className="text-muted-foreground">
            Your campaigns and tools, all in one place.
          </p>
        </div>
        <CreateCampaignForm />
      </div>

      {/* Quick access to the standalone tools — usable without a campaign. */}
      <section className="grid gap-3 sm:grid-cols-3">
        {QUICK_TOOLS.map(({ href, icon: Icon, title, body }) => (
          <Link key={href} href={href} className="group">
            <Card className="h-full transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md">
              <CardContent className="flex items-start gap-3 p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0">
                  <p className="font-medium">{title}</p>
                  <p className="text-xs text-muted-foreground">{body}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
          <BookOpen className="h-5 w-5 text-primary" />
          Campaigns
          {campaigns.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              ({campaigns.length})
            </span>
          )}
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
              <Link key={campaign.id} href={`/campaigns/${campaign.id}`}>
                <Card className="flex h-full flex-col transition-colors hover:border-primary/50">
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
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
