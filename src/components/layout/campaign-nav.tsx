"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Dices,
  Globe2,
  ListChecks,
  ScrollText,
  Swords,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Horizontal section navigation shown across all pages of a campaign. */
export function CampaignNav({ campaignId }: { campaignId: string }) {
  const pathname = usePathname();
  const base = `/campaigns/${campaignId}`;

  const items = [
    { href: base, label: "Overview", icon: Globe2, exact: true },
    // Points at the resolver so it opens the World Builder, not a picker.
    // `startsWith` also matches /worlds/<id>, so the tab stays active inside it.
    { href: `${base}/world`, label: "World", icon: BookOpen },
    { href: `${base}/characters`, label: "Characters", icon: Users },
    { href: `${base}/sessions`, label: "Sessions", icon: ScrollText },
    { href: `${base}/quests`, label: "Quests", icon: ListChecks },
    { href: `${base}/encounters`, label: "Encounters", icon: Swords },
    { href: `${base}/tables`, label: "Tables", icon: Dices },
  ];

  return (
    <nav className="flex gap-1 overflow-x-auto border-b">
      {items.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
