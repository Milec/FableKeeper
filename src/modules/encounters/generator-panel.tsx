"use client";

import * as React from "react";
import { Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { facetValues } from "@/lib/bestiary/filter";
import type { Creature } from "@/lib/bestiary/types";
import {
  COMPOSITIONS,
  COMPOSITION_LABELS,
  generateEncounter,
  type Composition,
} from "@/lib/encounters/generate";
import type { Combatant, Threat } from "@/lib/encounters/budget";
import { ChipSelect } from "./chip-select";

const selectCls =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * "Fill this encounter for me" — set criteria, press the button, and the PF2E
 * XP budget is filled from the bestiary. All the maths lives in
 * `@/lib/encounters/generate`.
 */
export function GeneratorPanel({
  pool,
  sourceLabels,
  partySize,
  partyLevel,
  threat,
  onGenerated,
}: {
  pool: readonly Creature[];
  sourceLabels: Record<string, string>;
  partySize: number;
  partyLevel: number;
  threat: Threat;
  onGenerated: (combatants: Combatant[]) => void;
}) {
  const [composition, setComposition] = React.useState<Composition>("any");
  const [types, setTypes] = React.useState<string[]>([]);
  const [rarities, setRarities] = React.useState<string[]>([]);
  const [sources, setSources] = React.useState<string[]>([]);
  const [minLevel, setMinLevel] = React.useState<string>("");
  const [maxLevel, setMaxLevel] = React.useState<string>("");
  const [error, setError] = React.useState<string | null>(null);
  const [lastXp, setLastXp] = React.useState<{ total: number; budget: number } | null>(null);

  const allTypes = React.useMemo(() => facetValues(pool, "types"), [pool]);
  const allRarities = React.useMemo(() => facetValues(pool, "rarity"), [pool]);
  const allSources = React.useMemo(() => facetValues(pool, "source"), [pool]);

  const run = () => {
    const result = generateEncounter({
      pool,
      partySize,
      partyLevel,
      threat,
      composition,
      filters: {
        types,
        rarities,
        sources,
        minLevel: minLevel === "" ? undefined : Number(minLevel),
        maxLevel: maxLevel === "" ? undefined : Number(maxLevel),
      },
    });
    if (result.error) {
      setError(result.error);
      setLastXp(null);
      return;
    }
    setError(null);
    setLastXp({ total: result.totalXp, budget: result.budget });
    onGenerated(result.combatants);
  };

  return (
    <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">Auto-fill this encounter</p>
        <span className="ml-auto text-xs text-muted-foreground">
          {pool.length} creatures available
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-1">
          <Label htmlFor="composition">Composition</Label>
          <select
            id="composition"
            value={composition}
            onChange={(e) => setComposition(e.target.value as Composition)}
            className={selectCls}
          >
            {COMPOSITIONS.map((c) => (
              <option key={c} value={c}>
                {COMPOSITION_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="minLevel">Min creature level</Label>
          <Input
            id="minLevel"
            type="number"
            placeholder="auto"
            value={minLevel}
            onChange={(e) => setMinLevel(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="maxLevel">Max creature level</Label>
          <Input
            id="maxLevel"
            type="number"
            placeholder="auto"
            value={maxLevel}
            onChange={(e) => setMaxLevel(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Creature type</Label>
        <ChipSelect options={allTypes} selected={types} onChange={setTypes} max={24} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Rarity</Label>
          <ChipSelect options={allRarities} selected={rarities} onChange={setRarities} />
        </div>
        <div className="space-y-1.5">
          <Label>Source book</Label>
          <ChipSelect
            options={allSources}
            selected={sources}
            onChange={setSources}
            labels={sourceLabels}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={run}>
          <Wand2 className="h-4 w-4" />
          Generate encounter
        </Button>
        {lastXp && (
          <p className="text-sm text-muted-foreground">
            Filled to{" "}
            <span className="font-medium text-foreground tabular-nums">
              {lastXp.total} XP
            </span>{" "}
            against a {lastXp.budget} XP budget.
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Generating replaces the current creature list. Adjust anything afterwards
        by hand.
      </p>
    </div>
  );
}
