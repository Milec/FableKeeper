"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { SidebarNav } from "./sidebar-nav";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Navigation drawer for small screens.
 *
 * The sidebar is hidden below `md`, which previously left phones with no way to
 * reach any module at all. This puts the same registry-driven navigation behind a
 * hamburger, closing on navigation and on Escape.
 */
export function MobileNav({
  fallbackCampaignId = null,
}: {
  fallbackCampaignId?: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  // Close whenever the route changes.
  React.useEffect(() => setOpen(false), [pathname]);

  // Escape to close, and prevent the page scrolling behind the drawer.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Open navigation"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden
        className={cn(
          "fixed inset-0 z-40 bg-background/80 backdrop-blur-sm transition-opacity md:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r bg-background shadow-xl transition-transform duration-200 ease-out md:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between border-b px-4">
          <span className="font-display text-lg font-bold tracking-wide">
            FableKeeper
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="max-h-[calc(100vh-3.5rem)] overflow-y-auto">
          <SidebarNav fallbackCampaignId={fallbackCampaignId} />
        </div>
      </div>
    </>
  );
}
