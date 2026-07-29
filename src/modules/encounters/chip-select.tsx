"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A compact multi-select rendered as toggleable chips. Used for creature type /
 * rarity / size / source criteria, where a handful of short values read better
 * as chips than as a multi-select listbox.
 */
export function ChipSelect({
  options,
  selected,
  onChange,
  labels,
  max,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Optional display labels keyed by option value. */
  labels?: Record<string, string>;
  /** Collapse past this many chips behind a "show all" toggle. */
  max?: number;
}) {
  const [expanded, setExpanded] = React.useState(false);

  // Always keep selected chips visible, even when collapsed, so a selection
  // can never be hidden (and therefore un-clearable) behind the toggle.
  const shown = React.useMemo(() => {
    if (typeof max !== "number" || expanded || options.length <= max) return options;
    const head = options.slice(0, max);
    const selectedTail = options.slice(max).filter((o) => selected.includes(o));
    return [...head, ...selectedTail];
  }, [options, max, expanded, selected]);

  const hidden = options.length - shown.length;

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {selected.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          Clear
        </button>
      )}
      {shown.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(opt)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs capitalize transition-colors",
              active
                ? "border-primary bg-primary/15 text-primary"
                : "border-input text-muted-foreground hover:text-foreground",
            )}
          >
            {labels?.[opt] ?? opt}
          </button>
        );
      })}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          +{hidden} more
        </button>
      )}
      {expanded && typeof max === "number" && options.length > max && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          Show fewer
        </button>
      )}
    </div>
  );
}
