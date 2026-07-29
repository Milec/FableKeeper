"use client";

import * as React from "react";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { facetValues, filterCreatures } from "@/lib/bestiary/filter";
import type { Creature } from "@/lib/bestiary/types";
import { creatureXp } from "@/lib/encounters/budget";
import { ChipSelect } from "./chip-select";

const PAGE = 60;

/**
 * Searchable, filterable browser over the whole PF2E bestiary. Clicking a row
 * adds that creature to the encounter. Results are capped and "load more"d so a
 * 1,100-creature list stays responsive without a virtualiser.
 */
export function BestiaryPicker({
  pool,
  partyLevel,
  sourceLabels,
  onAdd,
}: {
  pool: readonly Creature[];
  partyLevel: number;
  sourceLabels: Record<string, string>;
  onAdd: (creature: Creature) => void;
}) {
  const [search, setSearch] = React.useState("");
  const [types, setTypes] = React.useState<string[]>([]);
  const [limit, setLimit] = React.useState(PAGE);

  const allTypes = React.useMemo(() => facetValues(pool, "types"), [pool]);

  const matches = React.useMemo(
    () => filterCreatures(pool, { search, types }),
    [pool, search, types],
  );

  // Reset paging whenever the query changes.
  React.useEffect(() => setLimit(PAGE), [search, types]);

  const visible = matches.slice(0, limit);

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
      <div className="space-y-1.5">
        <Label htmlFor="creature-search">Search the bestiary</Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="creature-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="e.g. goblin, dragon, zombie…"
            className="pl-8"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Creature type</Label>
        <ChipSelect options={allTypes} selected={types} onChange={setTypes} max={24} />
      </div>

      <p className="text-xs text-muted-foreground">
        {matches.length} match{matches.length === 1 ? "" : "es"}
        {matches.length > visible.length && ` · showing ${visible.length}`}
      </p>

      <ul className="max-h-80 divide-y overflow-y-auto rounded-md border bg-background">
        {visible.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">
            No creatures match.
          </li>
        )}
        {visible.map((c) => {
          const xp = creatureXp(c.level, partyLevel);
          return (
            <li key={`${c.source}-${c.name}`}>
              <button
                type="button"
                onClick={() => onAdd(c)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
              >
                <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="truncate font-medium">{c.name}</span>
                  <span className="ml-2 text-xs capitalize text-muted-foreground">
                    {c.types.join(", ")}
                    {c.rarity !== "common" && ` · ${c.rarity}`}
                  </span>
                </span>
                <Badge variant="outline" className="shrink-0">
                  Lvl {c.level}
                </Badge>
                <span
                  className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground"
                  title="XP against the current party level"
                >
                  {xp > 0 ? `${xp} XP` : "—"}
                </span>
                <span className="w-10 shrink-0 text-right text-[10px] text-muted-foreground" title={sourceLabels[c.source] ?? c.source}>
                  {c.source}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {matches.length > visible.length && (
        <button
          type="button"
          onClick={() => setLimit((n) => n + PAGE)}
          className="w-full rounded-md border py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Show more
        </button>
      )}
    </div>
  );
}
