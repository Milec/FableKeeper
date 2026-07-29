"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { MODULES } from "@/modules/registry";
import { Badge } from "@/components/ui/badge";

/**
 * Primary navigation, derived entirely from the module registry so new modules
 * appear here automatically. Highlights the active route.
 */
export function SidebarNav() {
  const pathname = usePathname();

  const item = (
    href: string,
    label: string,
    Icon: React.ComponentType<{ className?: string }>,
    opts: { disabled?: boolean; badge?: string } = {},
  ) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    const content = (
      <>
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">{label}</span>
        {opts.badge && (
          <Badge variant="secondary" className="text-[10px]">
            {opts.badge}
          </Badge>
        )}
      </>
    );
    const className = cn(
      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
      active
        ? "bg-primary/10 text-primary"
        : "text-muted-foreground hover:bg-accent hover:text-foreground",
      opts.disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
    );

    if (opts.disabled) {
      return (
        <div key={href} className={className} aria-disabled>
          {content}
        </div>
      );
    }
    return (
      <Link key={href} href={href} className={className}>
        {content}
      </Link>
    );
  };

  return (
    <nav className="flex flex-col gap-1 p-3">
      {item("/dashboard", "Dashboard", LayoutDashboard)}
      <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Modules
      </p>
      {MODULES.map((mod) =>
        item(
          mod.status === "available" ? `/tools/${mod.id}` : "#",
          mod.name,
          mod.icon,
          {
            disabled: mod.status !== "available",
            badge: mod.status === "available" ? undefined : "Soon",
          },
        ),
      )}
    </nav>
  );
}
