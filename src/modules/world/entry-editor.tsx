"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { WikiResolver } from "@/components/world/entry-content";
import {
  RichMarkdownEditor,
  type LinkTarget,
} from "@/components/editor/rich-markdown-editor";
import {
  createEntry,
  updateEntry,
  type EntryActionState,
} from "@/lib/world/actions";
import { ALL_ENTRY_TYPES, ENTRY_TYPES } from "@/lib/world/entry-types";
import { templateFor } from "@/lib/world/templates";
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
  /** Other entries in this world, offered by the link picker/autocomplete. */
  linkTargets?: LinkTarget[];
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
  linkTargets = [],
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
  const [type, setType] = React.useState<WorldEntryType>(
    entry?.type ?? defaultType ?? "article",
  );

  // New entries start from their type's template (MythScribe-style prompts).
  // Remounting the editor with a new key lets the template land in an empty
  // draft without ever clobbering something the author has already written.
  const [editorKey, setEditorKey] = React.useState(0);
  const applyTemplate = () => {
    setMarkdown(templateFor(type));
    setEditorKey((k) => k + 1);
  };
  React.useEffect(() => {
    if (editing || initialMarkdown) return;
    setMarkdown(templateFor(defaultType ?? "article"));
    setEditorKey((k) => k + 1);
    // Only seed once, on mount, for a brand-new entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <Select
            id="type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as WorldEntryType)}
          >
            {ALL_ENTRY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ENTRY_TYPES[t].label}
              </option>
            ))}
          </Select>
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>Content</Label>
          <button
            type="button"
            onClick={applyTemplate}
            title={`Replace the content with the ${ENTRY_TYPES[type].label} template`}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Insert {ENTRY_TYPES[type].label} template
          </button>
        </div>
        <RichMarkdownEditor
          key={editorKey}
          name="markdown"
          defaultValue={markdown}
          onChange={setMarkdown}
          resolver={resolver}
          linkTargets={linkTargets}
          placeholder="Describe this part of your world…"
        />
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
