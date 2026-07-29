import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Styled native select.
 *
 * Native `<select>` popups are painted by the browser, and a `bg-transparent`
 * select leaves the option list with the platform default (white) background
 * while the option text inherits our near-white foreground — unreadable in dark
 * mode. Setting explicit colours on the control *and* its options fixes that,
 * so every dropdown in the app should use this rather than a bare `<select>`.
 *
 * Keeps native behaviour (real form semantics, mobile OS pickers, keyboard
 * support) and adds a chevron so it reads as a dropdown.
 */
const Select = React.forwardRef<
  HTMLSelectElement,
  React.ComponentPropsWithoutRef<"select">
>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(
        "flex h-9 w-full appearance-none rounded-md border border-input bg-background pl-3 pr-8 text-sm text-foreground shadow-sm transition-colors",
        "hover:border-ring/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        // The option list is rendered by the browser; force readable colours.
        "[&>optgroup]:bg-popover [&>optgroup]:text-popover-foreground",
        "[&>option]:bg-popover [&>option]:text-popover-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      aria-hidden
      className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
    />
  </div>
));
Select.displayName = "Select";

export { Select };
