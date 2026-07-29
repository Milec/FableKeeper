"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { MODULES, type ModuleDefinition } from "@/modules/registry";
import { Badge } from "@/components/ui/badge";

/**
 * Primary navigation, derived from the module registry. Global tools link to
 * `/tools/<id>`. Campaign modules link into the active campaign when the user is
 * inside one, otherwise to the dashboard to pick a campaign. Planned modules are
 * shown disabled with a "Soon" badge.
 */
export function SidebarNav() {
  const pathname = usePathname();
  const campaignMatch = pathname.match(/^\/campaigns\/([0-9a-f-]+)/i);
  const activeCampaignId = campaignMatch?.[1] ?? null;

  const campaignModules = MODULES.filter((m) => m.scope === "campaign");
  const globalModules = MODULES.filter((m) => m.scope === "global");

  const hrefFor = (mod: ModuleDefinition): string => {
    if (mod.scope === "global") return `/tools/${mod.id}`;
    return activeCampaignId
      ? `/campaigns/${activeCampaignId}${mod.campaignPath ?? ""}`
      : "/dashboard";
  };

  const renderItem = (mod: ModuleDefinition) => {
    const Icon = mod.icon;
    const planned = mod.status !== "available";
    const href = hrefFor(mod);
    const active =
      !planned && (pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`)));

    const content = (
      <>
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">{mod.name}</span>
        {planned && (
          <Badge variant="secondary" className="text-[10px]">
            Soon
          </Badge>
        )}
      </>
    );
    const className = cn(
      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
      active
        ? "bg-primary/10 text-primary"
        : "text-muted-foreground hover:bg-accent hover:text-foreground",
      planned && "cursor-not-allowed opacity-50 hover:bg-transparent hover:text-muted-foreground",
    );

    if (planned) {
      return (
        <div key={mod.id} className={className} aria-disabled>
          {content}
        </div>
      );
    }
    return (
      <Link key={mod.id} href={href} className={className} title={mod.description}>
        {content}
      </Link>
    );
  };

  const heading = (label: string) => (
    <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </p>
  );

  return (
    <nav className="flex flex-col gap-1 p-3">
      <Link
        href="/dashboard"
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          pathname === "/dashboard"
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <LayoutDashboard className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">Dashboard</span>
      </Link>

      {heading(activeCampaignId ? "This campaign" : "Campaign")}
      {campaignModules.map(renderItem)}

      {heading("Tools")}
      {globalModules.map(renderItem)}
    </nav>
  );
}
