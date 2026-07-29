"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Globe2, Lock, Plus, Search } from "lucide-react";
import { ENTRY_CATEGORIES, ENTRY_TYPES, type EntryCategory } from "@/lib/world/entry-types";
import type { EntryRef } from "@/lib/world/queries";
import type { World, WorldEntryType } from "@/types/database";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";

/**
 * The persistent World Builder navigator.
 *
 * Previously the entry-type filters only existed on the world index page, so you
 * had to walk campaign → world → index before you could reach anything, and lost
 * the navigation as soon as you opened an entry. This tree lives in the World
 * Builder layout instead, so the whole world is reachable from any entry: switch
 * worlds, filter by name, expand a category, jump straight to an entry.
 */
export function WorldTree({
  campaignId,
  worlds,
  currentWorldId,
  entries,
  canEdit,
}: {
  campaignId: string;
  worlds: World[];
  currentWorldId: string;
  entries: EntryRef[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ entryId?: string }>();
  const activeEntryId = params?.entryId;

  const [filter, setFilter] = React.useState("");
  const base = `/campaigns/${campaignId}/worlds/${currentWorldId}`;

  // Group entries by category → type, honouring the name filter.
  const { grouped, total } = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    const matching = q
      ? entries.filter((e) => e.title.toLowerCase().includes(q))
      : entries;

    const byCategory = new Map<EntryCategory, Map<WorldEntryType, EntryRef[]>>();
    for (const entry of matching) {
      const meta = ENTRY_TYPES[entry.type];
      if (!meta) continue;
      let types = byCategory.get(meta.category);
      if (!types) {
        types = new Map();
        byCategory.set(meta.category, types);
      }
      const list = types.get(entry.type);
      if (list) list.push(entry);
      else types.set(entry.type, [entry]);
    }
    for (const types of byCategory.values()) {
      for (const list of types.values()) {
        list.sort((a, b) => a.title.localeCompare(b.title));
      }
    }
    return { grouped: byCategory, total: matching.length };
  }, [entries, filter]);

  // Categories start expanded when filtering (so hits are visible) or when they
  // contain the entry you're currently viewing.
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const isCollapsed = (category: string) => !filter && collapsed.has(category);
  const toggle = (category: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });

  return (
    <div className="flex h-full flex-col gap-3">
      {/* World switcher */}
      <div className="space-y-1.5">
        <label
          htmlFor="world-switcher"
          className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          <Globe2 className="h-3.5 w-3.5" />
          World
        </label>
        {worlds.length > 1 ? (
          <Select
            id="world-switcher"
            value={currentWorldId}
            onChange={(e) =>
              router.push(`/campaigns/${campaignId}/worlds/${e.target.value}`)
            }
          >
            {worlds.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        ) : (
          <Link
            href={base}
            className={cn(
              "block truncate rounded-md px-2 py-1.5 text-sm font-medium",
              pathname === base ? "bg-primary/10 text-primary" : "hover:bg-accent",
            )}
          >
            {worlds.find((w) => w.id === currentWorldId)?.name ?? "World"}
          </Link>
        )}
      </div>

      {canEdit && (
        <Link
          href={`${base}/entries/new`}
          className="flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New entry
        </Link>
      )}

      {/* Filter */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter entries…"
          aria-label="Filter entries"
          className="flex h-8 w-full rounded-md border border-input bg-transparent pl-7 pr-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {/* Tree */}
      <nav className="min-h-0 flex-1 overflow-y-auto pr-1 text-sm">
        <Link
          href={base}
          className={cn(
            "mb-1 flex items-center gap-2 rounded-md px-2 py-1.5 font-medium",
            pathname === base
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          All entries
          <span className="ml-auto text-xs">{entries.length}</span>
        </Link>

        {total === 0 && (
          <p className="px-2 py-4 text-xs text-muted-foreground">
            {entries.length === 0
              ? canEdit
                ? "No entries yet. Create your first one."
                : "Nothing here yet."
              : "No entries match that filter."}
          </p>
        )}

        {ENTRY_CATEGORIES.map((category) => {
          const types = grouped.get(category);
          if (!types || types.size === 0) return null;
          const count = [...types.values()].reduce((n, l) => n + l.length, 0);
          const shut = isCollapsed(category);

          return (
            <div key={category} className="mb-1">
              <button
                type="button"
                onClick={() => toggle(category)}
                aria-expanded={!shut}
                className="flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                {shut ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                <span className="flex-1 text-left">{category}</span>
                <span>{count}</span>
              </button>

              {!shut && (
                <div className="ml-1 space-y-0.5 border-l pl-2">
                  {[...types.entries()].map(([type, list]) => {
                    const meta = ENTRY_TYPES[type];
                    const Icon = meta.icon;
                    return (
                      <div key={type}>
                        <Link
                          href={`${base}?type=${type}`}
                          className="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          <span className="flex-1 truncate">{meta.plural}</span>
                          <span>{list.length}</span>
                        </Link>
                        <ul>
                          {list.map((entry) => {
                            const active = entry.id === activeEntryId;
                            return (
                              <li key={entry.id}>
                                <Link
                                  href={`${base}/entries/${entry.id}`}
                                  className={cn(
                                    "flex items-center gap-1.5 rounded px-1.5 py-1 pl-5",
                                    active
                                      ? "bg-primary/10 font-medium text-primary"
                                      : "text-foreground/80 hover:bg-accent hover:text-foreground",
                                  )}
                                >
                                  <span className="flex-1 truncate">{entry.title}</span>
                                  {entry.is_secret && (
                                    <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
                                  )}
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
