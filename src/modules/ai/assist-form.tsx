"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EntryContent } from "@/components/world/entry-content";
import { generateEntryDraft, type AssistState } from "@/lib/ai/actions";
import { ENTRY_CATEGORIES, ENTRY_TYPES } from "@/lib/world/entry-types";
import type { WorldEntryType } from "@/types/database";

/** The types worth offering — prose entries, not the structural ones. */
const OFFERED: WorldEntryType[] = [
  "npc", "city", "town", "village", "landmark", "dungeon", "ruin",
  "region", "nation", "kingdom", "province", "organization", "noble_house",
  "guild", "religion", "pantheon", "culture", "language",
  "historical_event", "monster", "item", "book", "note", "article",
];

function GenerateButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Wand2 className="h-4 w-4" />
      )}
      {pending ? "Writing…" : "Draft it"}
    </Button>
  );
}

export function AssistForm({
  campaignId,
  worldId,
  worldName,
  entryCount,
  configured,
}: {
  campaignId: string;
  worldId: string;
  worldName: string;
  entryCount: number;
  configured: boolean;
}) {
  const [state, formAction] = useActionState<AssistState, FormData>(
    generateEntryDraft,
    {},
  );
  const [entryType, setEntryType] = React.useState<WorldEntryType>("npc");

  if (!configured) {
    return (
      <Card>
        <CardContent className="space-y-3 py-6 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Assist isn&apos;t configured yet
          </p>
          <p className="text-muted-foreground">
            Add an <code className="font-mono text-xs">ANTHROPIC_API_KEY</code>{" "}
            secret to the Cloudflare Worker and redeploy. Nothing else in
            FableKeeper depends on it — the rest of the app works without one.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="campaignId" value={campaignId} />
        <input type="hidden" name="worldId" value={worldId} />

        <div className="grid gap-4 sm:grid-cols-[14rem_1fr]">
          <div className="space-y-2">
            <Label htmlFor="entryType">What kind of entry?</Label>
            <Select
              id="entryType"
              name="entryType"
              value={entryType}
              onChange={(e) => setEntryType(e.target.value as WorldEntryType)}
            >
              {ENTRY_CATEGORIES.map((category) => {
                const types = OFFERED.filter(
                  (t) => ENTRY_TYPES[t].category === category,
                );
                if (!types.length) return null;
                return (
                  <optgroup key={category} label={category}>
                    {types.map((t) => (
                      <option key={t} value={t}>
                        {ENTRY_TYPES[t].label}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="brief">What should it be?</Label>
            <Textarea
              id="brief"
              name="brief"
              required
              minLength={10}
              placeholder="A smuggler who works the marsh routes and owes the wrong people a favour."
              className="min-h-[6rem]"
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {entryCount > 0
            ? `Grounded in ${entryCount.toLocaleString()} ${
                entryCount === 1 ? "entry" : "entries"
              } from ${worldName} — the draft will link to places and people you've already written.`
            : `${worldName} is empty, so this draft won't have anything to link to yet.`}
        </p>

        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}

        <GenerateButton />
      </form>

      {state.draft && (
        <Draft
          draft={state.draft}
          entryType={state.entryType ?? entryType}
          campaignId={campaignId}
          worldId={worldId}
        />
      )}
    </div>
  );
}

function Draft({
  draft,
  entryType,
  campaignId,
  worldId,
}: {
  draft: NonNullable<AssistState["draft"]>;
  entryType: WorldEntryType;
  campaignId: string;
  worldId: string;
}) {
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[12rem] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl font-bold">{draft.title}</h2>
            <Badge variant="outline">{ENTRY_TYPES[entryType].label}</Badge>
          </div>
          {draft.summary && (
            <p className="text-sm text-muted-foreground">{draft.summary}</p>
          )}
        </div>
        {/*
          Deliberately not saved automatically. The draft goes to the normal
          entry editor prefilled, so the GM reviews and edits before anything
          lands in their world.
        */}
        <form
          action={`/campaigns/${campaignId}/worlds/${worldId}/entries/new`}
          method="get"
        >
          <input type="hidden" name="type" value={entryType} />
          <input type="hidden" name="title" value={draft.title} />
          <input type="hidden" name="summary" value={draft.summary} />
          <input type="hidden" name="content" value={draft.markdown} />
          <input type="hidden" name="tags" value={draft.tags.join(", ")} />
          <Button type="submit" size="sm">
            Open in the editor
          </Button>
        </form>
      </div>

      {draft.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {draft.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      <EntryContent markdown={draft.markdown} resolver={{ hrefBySlug: {} }} />
    </section>
  );
}
