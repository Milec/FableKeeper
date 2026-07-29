"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select } from "@/components/ui/select";
import { loadBestiary } from "@/lib/bestiary/load";
import type { Creature } from "@/lib/bestiary/types";
import { GeneratorPanel } from "./generator-panel";
import { BestiaryPicker } from "./bestiary-picker";
import {
  saveEncounter,
  updateEncounter,
  type EncounterActionState,
} from "@/lib/encounters/actions";
import {
  THREATS,
  THREAT_LABELS,
  combatantXp,
  summarize,
  type Adjustment,
  type Combatant,
  type CombatantKind,
  type Threat,
} from "@/lib/encounters/budget";
import type { Encounter } from "@/types/database";
import { encounterCombatantsClient } from "@/modules/encounters/combatants";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<CombatantKind, string> = {
  creature: "Creature",
  simple_hazard: "Simple hazard",
  complex_hazard: "Complex hazard",
};

const RATING_COLOR: Record<Threat, string> = {
  trivial: "text-muted-foreground",
  low: "text-emerald-500",
  moderate: "text-amber-500",
  severe: "text-orange-500",
  extreme: "text-red-500",
};

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {editing ? "Save changes" : "Save encounter"}
    </Button>
  );
}

let counter = 0;
const newId = () => `c${Date.now()}_${counter++}`;

export function EncounterBuilder({
  campaignId,
  encounter,
  cancelHref,
}: {
  campaignId: string;
  encounter?: Encounter;
  cancelHref: string;
}) {
  const editing = Boolean(encounter);
  const action = editing ? updateEncounter : saveEncounter;
  const [state, formAction] = useActionState<EncounterActionState, FormData>(
    action,
    {},
  );

  const [partySize, setPartySize] = React.useState(encounter?.party_size ?? 4);
  const [partyLevel, setPartyLevel] = React.useState(encounter?.party_level ?? 1);
  const [threat, setThreat] = React.useState<Threat>(
    (encounter?.target_threat as Threat) ?? "moderate",
  );
  const [combatants, setCombatants] = React.useState<Combatant[]>(
    () => encounterCombatantsClient(encounter?.combatants) ?? [],
  );

  const update = (id: string, patch: Partial<Combatant>) =>
    setCombatants((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const remove = (id: string) =>
    setCombatants((cs) => cs.filter((c) => c.id !== id));
  const add = () =>
    setCombatants((cs) => [
      ...cs,
      { id: newId(), name: "", level: partyLevel, count: 1, kind: "creature", adjustment: "none" },
    ]);

  // The bestiary is code-split; load it once the builder mounts.
  const [pool, setPool] = React.useState<Creature[] | null>(null);
  const [sourceLabels, setSourceLabels] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    let alive = true;
    loadBestiary()
      .then((data) => {
        if (!alive) return;
        setPool(data.creatures);
        setSourceLabels(data.meta?.sources ?? {});
      })
      .catch(() => setPool([]));
    return () => {
      alive = false;
    };
  }, []);

  /** Add a bestiary creature, bumping the count when it's already present. */
  const addCreature = (creature: Creature) => {
    setCombatants((cs) => {
      const existing = cs.find(
        (c) => c.name === creature.name && c.level === creature.level,
      );
      if (existing) {
        return cs.map((c) =>
          c.id === existing.id ? { ...c, count: c.count + 1 } : c,
        );
      }
      return [
        ...cs,
        {
          id: newId(),
          name: creature.name,
          level: creature.level,
          count: 1,
          kind: "creature" as const,
          adjustment: "none" as const,
          source: creature.source,
        },
      ];
    });
  };

  const summary = summarize(combatants, partySize, partyLevel, threat);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="campaignId" value={campaignId} />
      {encounter && <input type="hidden" name="encounterId" value={encounter.id} />}
      <input type="hidden" name="combatants" value={JSON.stringify(combatants)} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5 lg:col-span-1">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" defaultValue={encounter?.name} placeholder="Ambush at the ford" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="partySize">Party size</Label>
          <Input id="partySize" name="partySize" type="number" min={1} max={12} value={partySize} onChange={(e) => setPartySize(Number(e.target.value))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="partyLevel">Party level</Label>
          <Input id="partyLevel" name="partyLevel" type="number" min={1} max={20} value={partyLevel} onChange={(e) => setPartyLevel(Number(e.target.value))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="targetThreat">Target threat</Label>
          <Select id="targetThreat" name="targetThreat" value={threat} onChange={(e) => setThreat(e.target.value as Threat)}>
            {THREATS.map((t) => (
              <option key={t} value={t}>{THREAT_LABELS[t]}</option>
            ))}
          </Select>
        </div>
      </div>

      {/* Live budget summary */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total XP</p>
            <p className="font-display text-3xl font-bold tabular-nums">{summary.totalXp}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Budget ({THREAT_LABELS[threat]})</p>
            <p className="font-display text-3xl font-bold tabular-nums text-muted-foreground">{summary.budget}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Actual threat</p>
            <p className={cn("font-display text-2xl font-bold", RATING_COLOR[summary.rating])}>
              {THREAT_LABELS[summary.rating]}
            </p>
          </div>
          <Badge variant={summary.overUnder > 0 ? "destructive" : "secondary"}>
            {summary.overUnder === 0
              ? "On budget"
              : summary.overUnder > 0
                ? `+${summary.overUnder} over`
                : `${summary.overUnder} under`}
          </Badge>
        </CardContent>
      </Card>

      {/* Bestiary-driven tools */}
      {pool === null ? (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading the PF2E bestiary…
        </div>
      ) : pool.length === 0 ? null : (
        <Tabs defaultValue="generate">
          <TabsList>
            <TabsTrigger value="generate">Auto-generate</TabsTrigger>
            <TabsTrigger value="browse">Add from bestiary</TabsTrigger>
          </TabsList>
          <TabsContent value="generate" className="pt-3">
            <GeneratorPanel
              pool={pool}
              sourceLabels={sourceLabels}
              partySize={partySize}
              partyLevel={partyLevel}
              threat={threat}
              onGenerated={setCombatants}
            />
          </TabsContent>
          <TabsContent value="browse" className="pt-3">
            <BestiaryPicker
              pool={pool}
              partyLevel={partyLevel}
              sourceLabels={sourceLabels}
              onAdd={addCreature}
            />
          </TabsContent>
        </Tabs>
      )}

      {/* Combatants */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Creatures &amp; hazards</Label>
          <Button type="button" variant="outline" size="sm" onClick={add}>
            <Plus className="h-4 w-4" />
            Add manually
          </Button>
        </div>
        {combatants.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            Add creatures and hazards to build the encounter.
          </p>
        ) : (
          <div className="space-y-2">
            {combatants.map((c) => (
              <div key={c.id} className="flex flex-wrap items-end gap-2 rounded-md border p-2">
                <div className="min-w-[8rem] flex-1 space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input value={c.name} onChange={(e) => update(c.id, { name: e.target.value })} placeholder="Goblin warrior" className="h-9" />
                </div>
                <div className="w-16 space-y-1">
                  <Label className="text-xs">Level</Label>
                  <Input type="number" min={-1} max={30} value={c.level} onChange={(e) => update(c.id, { level: Number(e.target.value) })} className="h-9" />
                </div>
                <div className="w-16 space-y-1">
                  <Label className="text-xs">Count</Label>
                  <Input type="number" min={1} max={50} value={c.count} onChange={(e) => update(c.id, { count: Number(e.target.value) })} className="h-9" />
                </div>
                <div className="w-36 space-y-1">
                  <Label className="text-xs">Type</Label>
                  <Select value={c.kind} onChange={(e) => update(c.id, { kind: e.target.value as CombatantKind })}>
                    {(Object.keys(KIND_LABELS) as CombatantKind[]).map((k) => (
                      <option key={k} value={k}>{KIND_LABELS[k]}</option>
                    ))}
                  </Select>
                </div>
                <div className="w-24 space-y-1">
                  <Label className="text-xs">Adjust</Label>
                  <Select value={c.adjustment} onChange={(e) => update(c.id, { adjustment: e.target.value as Adjustment })}>
                    <option value="none">None</option>
                    <option value="elite">Elite</option>
                    <option value="weak">Weak</option>
                  </Select>
                </div>
                <div className="w-14 space-y-1 text-right">
                  <Label className="text-xs">XP</Label>
                  <p className="h-9 pt-1.5 text-sm font-medium tabular-nums">{combatantXp(c, partyLevel)}</p>
                </div>
                <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => remove(c.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Input id="notes" name="notes" defaultValue={encounter?.notes ?? ""} placeholder="Terrain, tactics, treasure…" />
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-destructive">{state.error}</p>
      )}

      <div className="flex gap-2">
        <SubmitButton editing={editing} />
        <Button type="button" variant="ghost" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
