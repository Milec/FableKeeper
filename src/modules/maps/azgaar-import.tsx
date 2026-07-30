"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, FileJson, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  AzgaarParseError,
  compactAzgaarExport,
  parseAzgaarMap,
  type AzgaarMap,
} from "@/lib/maps/azgaar";
import {
  buildEntryDrafts,
  GROUP_LABELS,
  IMPORT_GROUPS,
  summarizeMap,
  type ImportGroup,
} from "@/lib/maps/entries";
import { ENTRY_TYPES } from "@/lib/world/entry-types";
import { importAzgaarMap, type ImportActionState } from "@/lib/maps/actions";
import type { WorldEntryType } from "@/types/database";

/** Groups that are usually noise on a first import. */
const DEFAULT_OFF: ImportGroup[] = ["rivers"];

function SubmitButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || count === 0}>
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Upload className="h-4 w-4" />
      )}
      {pending
        ? "Importing…"
        : count === 0
          ? "Nothing selected"
          : `Import ${count.toLocaleString()} ${count === 1 ? "entry" : "entries"}`}
    </Button>
  );
}

export function AzgaarImport({
  campaignId,
  worldId,
  worldName,
}: {
  campaignId: string;
  worldId: string;
  worldName: string;
}) {
  const [state, formAction] = useActionState<ImportActionState, FormData>(
    importAzgaarMap,
    {},
  );

  // The parser is pure, so the same code that will run on the server previews the
  // file in the browser before anything is uploaded.
  const [payload, setPayload] = React.useState<string | null>(null);
  const [map, setMap] = React.useState<AzgaarMap | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [reading, setReading] = React.useState(false);
  const [groups, setGroups] = React.useState<Set<ImportGroup>>(
    () => new Set(IMPORT_GROUPS.filter((g) => !DEFAULT_OFF.includes(g))),
  );
  const [minPop, setMinPop] = React.useState(0);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setReading(true);
    setFileError(null);
    setMap(null);
    setPayload(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      // Compact first: a Full export is far too large to send to a Server Action,
      // and this drops the parts the importer never reads.
      const compacted = compactAzgaarExport(text);
      setMap(parseAzgaarMap(compacted));
      setPayload(compacted);
    } catch (err) {
      setFileError(
        err instanceof AzgaarParseError
          ? err.message
          : "Could not read that file as an Azgaar export.",
      );
    } finally {
      setReading(false);
    }
  }

  const counts = map ? summarizeMap(map) : null;
  const drafts = React.useMemo(
    () =>
      map
        ? buildEntryDrafts(map, { groups: [...groups], minBurgPopulation: minPop })
        : [],
    [map, groups, minPop],
  );

  const byType = React.useMemo(() => {
    const out = new Map<WorldEntryType, number>();
    for (const d of drafts) out.set(d.type, (out.get(d.type) ?? 0) + 1);
    return [...out.entries()].sort((a, b) => b[1] - a[1]);
  }, [drafts]);

  const toggle = (group: ImportGroup) =>
    setGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });

  if (state.result) {
    return <ImportSummary result={state.result} campaignId={campaignId} worldId={worldId} />;
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="worldId" value={worldId} />
      <input type="hidden" name="json" value={payload ?? ""} />
      <input type="hidden" name="minBurgPopulation" value={minPop} />
      {[...groups].map((g) => (
        <input key={g} type="hidden" name="groups" value={g} />
      ))}

      <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">How to export from Azgaar</p>
        <ol className="ml-4 mt-1 list-decimal space-y-0.5">
          <li>
            Open your map in{" "}
            <a
              href="https://azgaar.github.io/Fantasy-Map-Generator/"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-foreground"
            >
              Azgaar&apos;s Fantasy Map Generator
            </a>
            .
          </li>
          <li>
            Choose <span className="font-medium">Menu → Export → Save to JSON</span>, then{" "}
            <span className="font-medium">Minimal</span> (or Full — both work).
          </li>
          <li>Upload the file below. Everything is read in your browser first.</li>
        </ol>
        <p className="mt-2">
          The <code className="font-mono text-xs">.map</code> save file won&apos;t
          work — it isn&apos;t JSON.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="azgaar-file">Azgaar JSON export</Label>
        <Input
          id="azgaar-file"
          type="file"
          accept="application/json,.json"
          onChange={(e) => void handleFile(e.target.files?.[0])}
          className="cursor-pointer file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-secondary-foreground"
        />
        {reading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Reading {fileName}…
          </p>
        )}
        {fileError && (
          <p role="alert" className="text-sm text-destructive">
            {fileError}
          </p>
        )}
      </div>

      {map && counts && (
        <>
          <Card>
            <CardContent className="space-y-1 py-3 text-sm">
              {/* A div, not a p: Badge renders a div and cannot nest inside one. */}
              <div className="flex flex-wrap items-center gap-2 font-medium">
                <FileJson className="h-4 w-4 text-primary" />
                {map.info.mapName ?? fileName}
                {map.info.version && (
                  <Badge variant="outline">Azgaar {map.info.version}</Badge>
                )}
              </div>
              <p className="text-muted-foreground">
                Importing into <span className="text-foreground">{worldName}</span>
                {payload && ` · ${(payload.length / 1024).toFixed(0)} KB to upload`}
              </p>
            </CardContent>
          </Card>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">What to import</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {IMPORT_GROUPS.map((group) => (
                <label
                  key={group}
                  className={`flex cursor-pointer items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                    counts[group] === 0
                      ? "opacity-50"
                      : groups.has(group)
                        ? "border-primary/50 bg-primary/5"
                        : "hover:bg-muted/50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={groups.has(group)}
                      disabled={counts[group] === 0}
                      onChange={() => toggle(group)}
                      className="accent-primary"
                    />
                    {GROUP_LABELS[group]}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {counts[group].toLocaleString()}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {groups.has("burgs") && counts.burgs > 0 && (
            <div className="space-y-2">
              <Label htmlFor="minPop">
                Skip settlements under{" "}
                <span className="tabular-nums">{minPop.toLocaleString()}</span> people
              </Label>
              <input
                id="minPop"
                type="range"
                min={0}
                max={10000}
                step={250}
                value={minPop}
                onChange={(e) => setMinPop(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <p className="text-xs text-muted-foreground">
                A large map can hold hundreds of hamlets. Capitals are always kept.
              </p>
            </div>
          )}

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="createMap"
              defaultChecked
              value="on"
              className="mt-0.5 accent-primary"
            />
            <span>
              Also build an interactive map
              <span className="block text-xs text-muted-foreground">
                Drops a pin for every settlement and site, linked to its article.
                Upload the map picture afterwards.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="secret" className="mt-0.5 accent-primary" />
            <span>
              Import as GM-only
              <span className="block text-xs text-muted-foreground">
                Players won&apos;t see these entries until you unmark them.
              </span>
            </span>
          </label>

          <Card>
            <CardContent className="space-y-2 py-3">
              <p className="text-sm font-medium">
                {drafts.length.toLocaleString()} entries will be created
              </p>
              {byType.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {byType.map(([type, count]) => (
                    <Badge key={type} variant="secondary">
                      {count.toLocaleString()} {ENTRY_TYPES[type].plural}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nothing selected yet.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Cities link to their state, province, culture, and religion, so the
                wiki is connected as soon as it lands. Entries that already exist in
                this world are left alone.
              </p>
            </CardContent>
          </Card>
        </>
      )}

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <SubmitButton count={drafts.length} />
    </form>
  );
}

function ImportSummary({
  result,
  campaignId,
  worldId,
}: {
  result: NonNullable<ImportActionState["result"]>;
  campaignId: string;
  worldId: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="space-y-1">
          <p className="font-medium">
            Imported {result.created.toLocaleString()} entries
            {result.mapName && ` from ${result.mapName}`}
          </p>
          <p className="text-sm text-muted-foreground">
            {result.links.toLocaleString()} links created between them
            {result.pins > 0 && ` · ${result.pins.toLocaleString()} map pins placed`}
            {result.skipped > 0 &&
              ` · ${result.skipped.toLocaleString()} already existed and were left alone`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {Object.entries(result.byType)
          .sort((a, b) => b[1] - a[1])
          .map(([type, count]) => (
            <Badge key={type} variant="secondary">
              {count.toLocaleString()} {ENTRY_TYPES[type as WorldEntryType]?.plural ?? type}
            </Badge>
          ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {result.mapId && (
          <Button asChild>
            <Link href={`/campaigns/${campaignId}/maps/${result.mapId}`}>
              Open the map
            </Link>
          </Button>
        )}
        <Button variant={result.mapId ? "outline" : "default"} asChild>
          <Link href={`/campaigns/${campaignId}/worlds/${worldId}`}>
            Open the world
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/campaigns/${campaignId}/maps`}>Import another map</Link>
        </Button>
      </div>
    </div>
  );
}
