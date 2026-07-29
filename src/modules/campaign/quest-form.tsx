"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarkdownField } from "@/components/markdown-field";
import {
  createQuest,
  updateQuest,
  type CampaignActionState,
} from "@/lib/campaign/actions";
import { contentMarkdown } from "@/lib/campaign/content";
import { QUEST_STATUS_LABELS } from "@/modules/campaign/quest-status";
import type { Quest } from "@/types/database";

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {editing ? "Save quest" : "Create quest"}
    </Button>
  );
}

export function QuestForm({
  campaignId,
  quest,
  cancelHref,
}: {
  campaignId: string;
  quest?: Quest;
  cancelHref: string;
}) {
  const editing = Boolean(quest);
  const action = editing ? updateQuest : createQuest;
  const [state, formAction] = useActionState<CampaignActionState, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="campaignId" value={campaignId} />
      {quest && <input type="hidden" name="questId" value={quest.id} />}

      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            name="title"
            defaultValue={quest?.title}
            placeholder="Rescue the missing caravan"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            name="status"
            defaultValue={quest?.status ?? "active"}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {Object.entries(QUEST_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Details</Label>
        <MarkdownField
          name="markdown"
          defaultValue={contentMarkdown(quest?.content)}
          placeholder="Objectives, leads, rewards…"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isSecret"
          defaultChecked={quest?.is_secret ?? false}
          className="h-4 w-4 rounded border-input accent-primary"
        />
        <span>
          GM only <span className="text-muted-foreground">— hide from players</span>
        </span>
      </label>

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
