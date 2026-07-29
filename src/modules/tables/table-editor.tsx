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
import {
  createRollTable,
  updateRollTable,
  type TableActionState,
} from "@/lib/tables/actions";
import { entryRanges, tableFormula, type TableEntry } from "@/lib/tables/roll";
import { tableEntriesClient } from "@/modules/tables/entries";
import type { RollTable } from "@/types/database";

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {editing ? "Save table" : "Create table"}
    </Button>
  );
}

export function TableEditor({
  campaignId,
  table,
  cancelHref,
}: {
  campaignId: string;
  table?: RollTable;
  cancelHref: string;
}) {
  const editing = Boolean(table);
  const action = editing ? updateRollTable : createRollTable;
  const [state, formAction] = useActionState<TableActionState, FormData>(action, {});

  const [entries, setEntries] = React.useState<TableEntry[]>(
    () => tableEntriesClient(table?.entries) ?? [{ weight: 1, text: "" }],
  );
  const ranges = entryRanges(entries.filter((e) => e.text.trim()));

  const update = (i: number, patch: Partial<TableEntry>) =>
    setEntries((es) => es.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  const remove = (i: number) => setEntries((es) => es.filter((_, idx) => idx !== i));
  const add = () => setEntries((es) => [...es, { weight: 1, text: "" }]);

  const cleaned = entries.filter((e) => e.text.trim());

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="campaignId" value={campaignId} />
      {table && <input type="hidden" name="tableId" value={table.id} />}
      <input type="hidden" name="entries" value={JSON.stringify(cleaned)} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" defaultValue={table?.name} placeholder="Wilderness Events" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="folder">Folder (optional)</Label>
          <Input id="folder" name="folder" defaultValue={table?.folder ?? ""} placeholder="Travel" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Input id="description" name="description" defaultValue={table?.description ?? ""} placeholder="What this table is for" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tags">Tags</Label>
        <Input id="tags" name="tags" defaultValue={table?.tags?.join(", ") ?? ""} placeholder="comma, separated" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Entries</Label>
          <Badge variant="secondary" className="font-mono">{tableFormula(cleaned)}</Badge>
        </div>
        <div className="space-y-2">
          {entries.map((entry, i) => {
            const range = ranges.find((r) => r.text === entry.text && entry.text.trim());
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
                  {range ? (range.min === range.max ? range.min : `${range.min}–${range.max}`) : "—"}
                </span>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={entry.weight}
                  onChange={(e) => update(i, { weight: Number(e.target.value) })}
                  className="w-16"
                  aria-label="Weight"
                />
                <Input
                  value={entry.text}
                  onChange={(e) => update(i, { text: e.target.value })}
                  placeholder="Result text"
                  className="flex-1"
                />
                <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => remove(i)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="h-4 w-4" />
          Add entry
        </Button>
      </div>

      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}

      <div className="flex gap-2">
        <SubmitButton editing={editing} />
        <Button type="button" variant="ghost" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
