"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { FileText, Lock, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchResult {
  id: string;
  title: string;
  summary: string | null;
  typeLabel: string;
  isSecret: boolean;
  href: string;
}

/**
 * Global ⌘K / Ctrl+K command palette. Scoped to the active campaign, it
 * debounces typeahead queries against the search API and navigates to entries.
 * Registered once in the campaign layout.
 */
export function CommandPalette({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);

  // Toggle with ⌘K / Ctrl+K.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Debounced search.
  React.useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/campaigns/${campaignId}/search?q=${encodeURIComponent(query)}`,
        );
        const data = (await res.json()) as { results: SearchResult[] };
        setResults(data.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query, campaignId]);

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Search entries"
      shouldFilter={false}
      className="fixed left-1/2 top-24 z-50 w-[92vw] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0"
    >
      <div className="flex items-center gap-2 border-b px-3">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Search this campaign…"
          className="flex h-11 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <Command.List className="max-h-[22rem] overflow-y-auto p-2">
        {query.trim().length < 2 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            Type at least 2 characters to search.
          </p>
        ) : loading && results.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            Searching…
          </p>
        ) : (
          <Command.Empty className="px-2 py-6 text-center text-sm text-muted-foreground">
            No entries found.
          </Command.Empty>
        )}
        {results.map((r) => (
          <Command.Item
            key={r.id}
            value={r.id}
            onSelect={() => go(r.href)}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm",
              "aria-selected:bg-accent aria-selected:text-accent-foreground",
            )}
          >
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate">
              <span className="font-medium">{r.title}</span>
              {r.summary && (
                <span className="ml-2 text-muted-foreground">{r.summary}</span>
              )}
            </span>
            {r.isSecret && <Lock className="h-3 w-3 text-muted-foreground" />}
            <span className="shrink-0 text-xs text-muted-foreground">
              {r.typeLabel}
            </span>
          </Command.Item>
        ))}
      </Command.List>
    </Command.Dialog>
  );
}
