"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Eye, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EntryContent, type WikiResolver } from "@/components/world/entry-content";
import {
  createEntry,
  updateEntry,
  type EntryActionState,
} from "@/lib/world/actions";
import { ALL_ENTRY_TYPES, ENTRY_TYPES } from "@/lib/world/entry-types";
import type { WorldEntry, WorldEntryType } from "@/types/database";

interface EntryEditorProps {
  campaignId: string;
  worldId: string;
  resolver: WikiResolver;
  /** Present when editing; absent when creating. */
  entry?: WorldEntry;
  /** Pre-selected type when creating (e.g. from the entry browser). */
  defaultType?: WorldEntryType;
  /** Pre-filled title when creating (e.g. from a missing wiki link). */
  defaultTitle?: string;
  /** Where "Cancel" returns to. */
  cancelHref: string;
}

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {editing ? "Save changes" : "Create entry"}
    </Button>
  );
}

export function EntryEditor({
  campaignId,
  worldId,
  resolver,
  entry,
  defaultType,
  defaultTitle,
  cancelHref,
}: EntryEditorProps) {
  const editing = Boolean(entry);
  const action = editing ? updateEntry : createEntry;
  const [state, formAction] = useActionState<EntryActionState, FormData>(
    action,
    {},
  );

  const initialMarkdown =
    (entry?.content as { markdown?: string } | null)?.markdown ?? "";
  const [markdown, setMarkdown] = React.useState(initialMarkdown);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="worldId" value={worldId} />
      {entry && <input type="hidden" name="entryId" value={entry.id} />}

      <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            name="title"
            defaultValue={entry?.title ?? defaultTitle}
            placeholder="e.g. The Free City of Absalom"
            required
            maxLength={200}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="type">Type</Label>
          <select
            id="type"
            name="type"
            defaultValue={entry?.type ?? defaultType ?? "article"}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {ALL_ENTRY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ENTRY_TYPES[t].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="summary">Summary</Label>
        <Input
          id="summary"
          name="summary"
          defaultValue={entry?.summary ?? ""}
          placeholder="A one-line description shown in lists and search."
          maxLength={500}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Content</Label>
          <span className="text-xs text-muted-foreground">
            Markdown supported · link entries with{" "}
            <code className="font-mono">[[Entry Title]]</code>
          </span>
        </div>
        <Tabs defaultValue="write">
          <TabsList>
            <TabsTrigger value="write">
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Write
            </TabsTrigger>
            <TabsTrigger value="preview">
              <Eye className="mr-1.5 h-3.5 w-3.5" />
              Preview
            </TabsTrigger>
          </TabsList>
          <TabsContent value="write">
            <Textarea
              name="markdown"
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              placeholder="Describe this part of your world…"
              className="min-h-[20rem] font-mono text-sm"
            />
          </TabsContent>
          <TabsContent value="preview">
            <div className="min-h-[20rem] rounded-md border p-4">
              <EntryContent markdown={markdown} resolver={resolver} />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="tags">Tags</Label>
          <Input
            id="tags"
            name="tags"
            defaultValue={entry?.tags?.join(", ") ?? ""}
            placeholder="comma, separated, tags"
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isSecret"
              defaultChecked={entry?.is_secret ?? false}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            <span>
              GM secret{" "}
              <span className="text-muted-foreground">
                — hidden from players
              </span>
            </span>
          </label>
        </div>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
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
