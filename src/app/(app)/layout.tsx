import Link from "next/link";
import { Dices } from "lucide-react";
import { getUserCampaigns, requireUser } from "@/lib/auth";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { UserMenu } from "@/components/layout/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  // Campaign-scoped modules need a campaign to point at. Outside one, fall back
  // to the most recently updated campaign so links like "World Builder" always
  // land somewhere useful instead of bouncing back to the dashboard.
  const campaigns = await getUserCampaigns();
  const fallbackCampaignId =
    [...campaigns].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]?.id ??
    null;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background/85 px-2 backdrop-blur-md sm:px-4">
        <div className="flex min-w-0 items-center gap-1">
          <MobileNav fallbackCampaignId={fallbackCampaignId} />
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:text-primary"
          >
            <Dices className="h-5 w-5 text-primary" />
            <span className="font-display text-lg font-bold tracking-wide">
              FableKeeper
            </span>
          </Link>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <UserMenu
            email={user.email}
            displayName={user.profile?.display_name ?? null}
            avatarUrl={user.profile?.avatar_url ?? null}
          />
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar on md+; below that the same nav lives in MobileNav's drawer. */}
        <aside className="hidden w-64 shrink-0 border-r bg-muted/20 md:block">
          <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto">
            <SidebarNav fallbackCampaignId={fallbackCampaignId} />
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
